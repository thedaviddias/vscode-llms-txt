import * as vscode from 'vscode'
import type { Website } from '../types'
import { fetchWebsites } from '../services/websiteService'
import { CategoryItem, NoResultsItem, WebsiteItem } from '../treeItems'
import type { FavoritesProvider } from './favoritesProvider'

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
  private static readonly CACHE_KEY = 'websitesCache'
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
  private static readonly CATEGORY_STATES_KEY = 'categoryStates'
  private categoryStates: Map<string, boolean> = new Map() // true = expanded, false = collapsed
  private favoritesProvider?: FavoritesProvider

  constructor(context: vscode.ExtensionContext) {
    this.context = context

    // Load category states
    const savedStates = this.context.globalState.get<Record<string, boolean>>(WebsitesProvider.CATEGORY_STATES_KEY)
    if (savedStates) {
      this.categoryStates = new Map(Object.entries(savedStates))
    }

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
      if (!this.currentSearchQuery) {
        // If no search query, fetch all websites
        this.websites = await fetchWebsites()
        console.log('Fetched websites:', this.websites.length)

        // Update cache with timestamp
        await this.context.globalState.update(WebsitesProvider.CACHE_KEY, {
          timestamp: Date.now(),
          websites: this.websites
        })
        console.log('Websites cached at:', new Date())
      } else {
        // If there's a search query, filter the websites
        const allWebsites = await fetchWebsites()
        console.log('Fetched all websites for search:', allWebsites.length)
        this.websites = allWebsites.filter(
          website =>
            website.name.toLowerCase().includes(this.currentSearchQuery) ||
            website.domain.toLowerCase().includes(this.currentSearchQuery) ||
            website.description.toLowerCase().includes(this.currentSearchQuery)
        )
        console.log('Filtered websites:', this.websites.length)
      }

      // Organize websites by category
      this.organizeWebsitesByCategory()

      // Notify VS Code that the tree data has changed
      this._onDidChangeTreeData.fire(undefined)
      console.log('Tree data updated')

      // Only expand categories if there's a search query
      if (this.currentSearchQuery) {
        await this.expandAllCategories()
        console.log('Categories expanded for search results')
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
        await this.treeView.reveal(item, { expand: true })
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
    if (this.websites.length === 0) {
      console.log('No websites found, showing NoResultsItem')
      this.rootItems = [new NoResultsItem()]
      return
    }

    for (const website of this.websites) {
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
      return new CategoryItem(
        config.displayName,
        websites,
        config.icon,
        config.description,
        isExpanded
      )
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
    const lowerQuery = query.toLowerCase()

    return this.websites.filter(
      website =>
        website.name.toLowerCase().includes(lowerQuery) ||
        website.domain.toLowerCase().includes(lowerQuery) ||
        website.description.toLowerCase().includes(lowerQuery)
    )
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
    this._onDidChangeTreeData.fire(undefined)
  }

  setFavoritesProvider(provider: FavoritesProvider) {
    this.favoritesProvider = provider
  }
}
