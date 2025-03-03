import * as vscode from 'vscode'
import type { Website } from '../types'
import { fetchWebsites } from '../services/websiteService'
import { CategoryItem, NoResultsItem, WebsiteItem } from '../treeItems'
import type { FavoritesProvider } from './favoritesProvider'
import { SearchService } from '../services/searchService'

export type TreeItemType = WebsiteItem | CategoryItem | NoResultsItem

/**
 * Tree data provider for displaying websites in the VS Code sidebar
 */
export class WebsitesProvider implements vscode.TreeDataProvider<TreeItemType> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItemType | undefined | null> =
    new vscode.EventEmitter<TreeItemType | undefined | null>()
  readonly onDidChangeTreeData: vscode.Event<TreeItemType | undefined | null> =
    this._onDidChangeTreeData.event

  private websites: Website[] = []
  private context: vscode.ExtensionContext
  private categories: Map<string, Website[]> = new Map()
  private rootItems: TreeItemType[] = []
  private childToParentMap = new Map<string, CategoryItem>()
  private treeView?: vscode.TreeView<TreeItemType>
  private currentSearchQuery = ''
  private currentCategory?: string
  private static readonly CACHE_KEY = 'websitesCache'
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
  private static readonly CATEGORY_STATES_KEY = 'categoryStates'
  private categoryStates: Map<string, boolean> = new Map() // true = expanded, false = collapsed
  private favoritesProvider?: FavoritesProvider
  private searchService: SearchService

  constructor(context: vscode.ExtensionContext) {
    this.context = context
    this.searchService = new SearchService([])

    // Clear any existing category states to ensure all start collapsed
    this.categoryStates = new Map()
    this.context.globalState.update(WebsitesProvider.CATEGORY_STATES_KEY, {})
    console.log('Category states reset to collapsed')

    // Load cached websites if available and not expired
    const cache = this.context.globalState.get<{
      timestamp: number
      websites: Website[]
    }>(WebsitesProvider.CACHE_KEY)

    if (cache) {
      const now = Date.now()
      const isExpired = now - cache.timestamp > WebsitesProvider.CACHE_DURATION

      if (!isExpired) {
        console.log('Using cached websites from:', new Date(cache.timestamp))
        this.websites = cache.websites
        this.organizeWebsitesByCategory()
      } else {
        console.log('Cache expired, will fetch fresh data')
      }
    }
  }

  /**
   * Sets the tree view reference and sets up collapse/expand handlers
   */
  setTreeView(view: vscode.TreeView<TreeItemType>): void {
    this.treeView = view

    // Handle collapse events
    view.onDidCollapseElement(async e => {
      if (e.element instanceof CategoryItem) {
        this.categoryStates.set(e.element.label as string, false)
        await this.saveCategoryStates()
      }
    })

    // Handle expand events
    view.onDidExpandElement(async e => {
      if (e.element instanceof CategoryItem) {
        this.categoryStates.set(e.element.label as string, true)
        await this.saveCategoryStates()
      }
    })

    // Initial expansion based on saved states
    this.restoreCategoryStates()
  }

  /**
   * Saves category states to persistent storage
   */
  private async saveCategoryStates(): Promise<void> {
    const states = Object.fromEntries(this.categoryStates)
    await this.context.globalState.update(WebsitesProvider.CATEGORY_STATES_KEY, states)
  }

  /**
   * Restores category states from saved state
   */
  private async restoreCategoryStates(): Promise<void> {
    if (!this.treeView) return

    for (const item of this.rootItems) {
      if (item instanceof CategoryItem) {
        const categoryName = item.label as string
        const isExpanded = this.categoryStates.get(categoryName) ?? false // Always default to collapsed

        if (isExpanded) {
          await this.treeView.reveal(item, { expand: true })
        }
      }
    }
  }

  /**
   * Updates the search filter
   */
  updateSearch(query: string): void {
    this.currentSearchQuery = query.toLowerCase()
    this.refresh()
  }

  async refresh(): Promise<void> {
    try {
      console.log('Refreshing websites...')
      const allWebsites = await fetchWebsites()
      console.log('Fetched websites:', allWebsites.length)

      this.websites = allWebsites
      await this.searchService.updateDataset(allWebsites)

      // Update cache with timestamp
      await this.context.globalState.update(WebsitesProvider.CACHE_KEY, {
        timestamp: Date.now(),
        websites: allWebsites
      })
      console.log('Websites cached at:', new Date())

      // Organize websites by category
      this.organizeWebsitesByCategory()

      // Notify VS Code that the tree data has changed
      this._onDidChangeTreeData.fire(undefined)
      console.log('Tree data updated')

      // Wait a bit for the tree view to update before expanding categories
      if (this.currentSearchQuery) {
        // Use setTimeout to ensure tree view is updated
        setTimeout(async () => {
          try {
            await this.expandAllCategories()
            console.log('Categories expanded for search results')
          } catch (error) {
            console.log('Error expanding categories:', error)
            // Don't throw here as it's not critical
          }
        }, 100)
      }
    } catch (error) {
      console.error('Error refreshing websites:', error)
      if (error instanceof Error) {
        vscode.window.showErrorMessage(`Failed to refresh websites: ${error.message}`)
      } else {
        vscode.window.showErrorMessage('Failed to refresh websites: Unknown error')
      }
      throw error
    }
  }

  /**
   * Expands all categories in the tree view
   */
  private async expandAllCategories(): Promise<void> {
    if (!this.treeView) return

    for (const item of this.rootItems) {
      if (item instanceof CategoryItem) {
        try {
          await this.treeView.reveal(item, { expand: true, focus: false })
          // Add small delay between expansions to prevent race conditions
          await new Promise(resolve => setTimeout(resolve, 50))
        } catch (error) {
          console.log(`Error expanding category ${item.label}:`, error)
        }
      }
    }
  }

  /**
   * Organizes websites by category
   */
  private organizeWebsitesByCategory(): void {
    console.log('Organizing websites by category...')
    this.categories.clear()
    this.childToParentMap.clear()

    // Get filtered websites if there's a search query
    const websitesToShow = this.currentSearchQuery
      ? this.searchService.search(this.currentSearchQuery, this.currentCategory)
      : this.websites

    // Category definitions with icons, descriptions, and slug mappings
    const categoryConfig = new Map([
      ['ai-ml', {
        displayName: 'AI & Machine Learning',
        icon: 'brain',
        description: 'AI models, ML tools, and LLM platforms'
      }],
      ['developer-tools', {
        displayName: 'Developer Tools',
        icon: 'code',
        description: 'IDEs, CLIs, debugging and development tools'
      }],
      ['data-analytics', {
        displayName: 'Data & Analytics',
        icon: 'database',
        description: 'Databases, analytics platforms, and data processing tools'
      }],
      ['infrastructure-cloud', {
        displayName: 'Infrastructure & Cloud',
        icon: 'server',
        description: 'Hosting, deployment, and cloud services'
      }],
      ['security-identity', {
        displayName: 'Security & Identity',
        icon: 'lock',
        description: 'Security tools, authentication, and compliance solutions'
      }],
      ['integration-automation', {
        displayName: 'Integration & Automation',
        icon: 'sync',
        description: 'API platforms, workflow automation, and integration tools'
      }],
      ['uncategorized', {
        displayName: 'Uncategorized',
        icon: 'folder',
        description: 'Other websites'
      }]
    ])

    // If no websites are found, create a special "no results" category
    if (websitesToShow.length === 0) {
      console.log('No websites found, showing NoResultsItem')
      this.rootItems = [new NoResultsItem()]
      return
    }

    for (const website of websitesToShow) {
      const categorySlug = website.category || 'uncategorized'

      if (!this.categories.has(categorySlug)) {
        this.categories.set(categorySlug, [])
      }

      const categoryWebsites = this.categories.get(categorySlug)
      if (categoryWebsites) {
        categoryWebsites.push(website)
      }
    }

    // Update root items with saved states and custom formatting
    this.rootItems = Array.from(this.categories.entries()).map(([categorySlug, websites]) => {
      const isExpanded = this.categoryStates.get(categorySlug) ?? false // Default to collapsed
      const config = categoryConfig.get(categorySlug) || {
        displayName: categorySlug,
        icon: 'folder',
        description: `${categorySlug} websites`
      }

      // Create category with collapsed state
      const categoryItem = new CategoryItem(
        config.displayName,
        websites,
        config.icon,
        config.description,
        isExpanded
      )

      return categoryItem
    })

    console.log('Categories created:', this.categories.size)
    console.log('Root items:', this.rootItems.length)

    // Build the parent-child relationship map
    for (const categoryItem of this.rootItems) {
      if (categoryItem instanceof CategoryItem) {
        for (const website of categoryItem.websites) {
          // Use website domain as a unique identifier
          this.childToParentMap.set(website.domain, categoryItem)
        }
      }
    }
    console.log('Parent-child relationships mapped')
  }

  /**
   * Gets the tree item for a given element
   */
  getTreeItem(element: TreeItemType): vscode.TreeItem {
    return element
  }

  /**
   * Gets the children of a given element
   */
  getChildren(element?: TreeItemType): vscode.ProviderResult<TreeItemType[]> {
    if (!element) {
      // Return root items (categories)
      return Promise.resolve(this.rootItems)
    }

    if (element instanceof CategoryItem) {
      // Return websites for this category with favorite status
      return Promise.resolve(element.websites.map(website =>
        new WebsiteItem(website, this.favoritesProvider?.isFavorite(website) ?? false)
      ))
    }

    return Promise.resolve([])
  }

  /**
   * Gets the parent of a given element
   * Required for the reveal method to work
   */
  getParent(element: TreeItemType): vscode.ProviderResult<CategoryItem> {
    if (element instanceof WebsiteItem) {
      // Return the parent category for this website
      return this.childToParentMap.get(element.website.domain)
    }

    // Categories and NoResultsItem are at the root level, so they have no parent
    return null
  }

  /**
   * Gets all root items (categories)
   */
  getRootItems(): TreeItemType[] {
    return this.rootItems
  }

  /**
   * Gets a website by name
   */
  getWebsiteByName(name: string): Website | undefined {
    return this.websites.find(website => website.name === name)
  }

  /**
   * Searches websites by query
   */
  searchWebsites(query: string): Website[] {
    return this.searchService.search(query, this.currentCategory)
  }

  private getItemLabel(item: WebsiteItem | CategoryItem): string {
    if (typeof item.label === 'string') {
      return item.label
    }
    return item.label?.label || ''
  }

  /**
   * Gets all websites
   */
  public getAllWebsites(): Website[] {
    return this.websites
  }

  /**
   * Gets a tree item for a specific website
   */
  public getTreeItemForWebsite(website: Website): WebsiteItem | undefined {
    const item = new WebsiteItem(website, this.favoritesProvider?.isFavorite(website) ?? false)
    return item
  }

  /**
   * Clears the current search
   */
  public clearSearch(): void {
    this.currentSearchQuery = ''
    this.refresh()
  }

  setFavoritesProvider(provider: FavoritesProvider) {
    this.favoritesProvider = provider
  }

  /**
   * Get search suggestions
   */
  getSearchSuggestions(query: string): string[] {
    return this.searchService.getSuggestions(query, this.currentCategory)
  }

  /**
   * Get all available categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys())
  }

  /**
   * Set the current category filter
   */
  setCurrentCategory(category: string): void {
    this.currentCategory = category
    this.refresh()
  }

  /**
   * Clear the current category filter
   */
  clearCategoryFilter(): void {
    this.currentCategory = undefined
    this.refresh()
  }
}
