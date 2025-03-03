import type { Website } from '../types'

interface FuseResult<T> {
  item: T
  refIndex: number
  score?: number
}

interface SearchHistoryEntry {
  query: string
  category?: string
  timestamp: number
}

// Configure Fuse.js options for website search
const fuseOptions = {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'domain', weight: 1.5 },
    { name: 'description', weight: 1 },
    { name: 'category', weight: 1.5 }
  ],
  threshold: 0.4, // Lower threshold = stricter matching
  includeScore: true,
  shouldSort: true,
  minMatchCharLength: 2
}

const MAX_HISTORY_ITEMS = 10

export class SearchService {
  private fuse!: import('fuse.js').default<Website>
  private allWebsites: Website[] = []
  private categories: Set<string> = new Set()
  private searchHistory: SearchHistoryEntry[] = []
  private recentSearches: string[] = []
  private readonly maxHistory: number = 10

  constructor(websites: Website[] = []) {
    this.initializeFuse(websites).catch(error => {
      console.error('Failed to initialize Fuse:', error)
    })
  }

  private async initializeFuse(websites: Website[]): Promise<void> {
    const FuseModule = await import('fuse.js')
    this.fuse = new FuseModule.default(websites, fuseOptions)
    this.allWebsites = websites
    this.categories = new Set(websites.map(w => w.category || 'uncategorized'))
  }

  /**
   * Update the dataset for searching
   */
  async updateDataset(websites: Website[]): Promise<void> {
    await this.initializeFuse(websites)
  }

  /**
   * Search websites using fuzzy matching
   * @param query Search query
   * @param category Optional category to filter by
   * @returns Array of matching websites, sorted by relevance
   */
  search(query: string, category?: string): Website[] {
    // Add to search history
    if (query.trim()) {
      this.addToHistory(query, category)
    }

    if (!query && !category) {
      return this.allWebsites
    }

    let results: Website[] = []

    if (query) {
      const searchResults = this.fuse.search(query) as FuseResult<Website>[]
      results = searchResults.map(result => result.item)
    } else {
      results = this.allWebsites
    }

    if (category) {
      results = results.filter(website => (website.category || 'uncategorized') === category)
    }

    return results
  }

  /**
   * Get search suggestions based on partial input
   * @param partial Partial search input
   * @param category Optional category to filter suggestions by
   * @returns Array of suggestion strings
   */
  getSuggestions(partial: string, category?: string): string[] {
    if (!partial || partial.length < 2) {
      // Return recent searches when no input
      return this.getRecentSearches(category)
    }

    const results = this.fuse.search(partial, { limit: 5 }) as FuseResult<Website>[]
    let suggestions = results
      .map(result => result.item.name)
      .filter((name): name is string => name !== undefined) // Type guard to ensure no undefined values

    if (category) {
      suggestions = suggestions.filter(name => {
        const website = this.allWebsites.find(w => w.name === name)
        return website && (website.category || 'uncategorized') === category
      })
    }

    // Combine with recent searches that match
    const recentSearches = this.getRecentSearches(category)
      .filter(search => search.toLowerCase().includes(partial.toLowerCase()))

    return [...new Set([...suggestions, ...recentSearches])]
  }

  /**
   * Get all available categories
   */
  getCategories(): string[] {
    return Array.from(this.categories)
  }

  /**
   * Add a search to history
   */
  private addToHistory(query: string, category?: string): void {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return

    // Remove duplicate if exists
    this.searchHistory = this.searchHistory.filter(
      entry => entry.query !== trimmedQuery || entry.category !== category
    )

    // Add new entry
    this.searchHistory.unshift({
      query: trimmedQuery,
      category,
      timestamp: Date.now()
    })

    // Keep only recent items
    this.searchHistory = this.searchHistory.slice(0, MAX_HISTORY_ITEMS)
  }

  /**
   * Get recent searches
   */
  private getRecentSearches(category?: string): string[] {
    return this.searchHistory
      .filter(entry => !category || entry.category === category)
      .map(entry => entry.query)
      .filter((query): query is string => query !== undefined) // Type guard to ensure no undefined values
  }
}
