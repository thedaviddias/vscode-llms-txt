import * as vscode from 'vscode'
import type { Website } from '../types'

/**
 * Tree item for displaying no results message
 */
export class NoResultsItem extends vscode.TreeItem {
  constructor() {
    super('No results found', vscode.TreeItemCollapsibleState.None)
    this.description = 'Try a different search term'
    this.contextValue = 'no-results'
    this.iconPath = new vscode.ThemeIcon('info')
  }
}

/**
 * Tree item representing a category
 */
export class CategoryItem extends vscode.TreeItem {
  websites: Website[]

  constructor(category: string, websites: Website[], icon: string = 'folder', description?: string, isExpanded = false) {
    super(
      category,
      isExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
    )

    this.websites = websites
    this.contextValue = 'category'
    this.description = `(${websites.length})`
    this.iconPath = new vscode.ThemeIcon(icon)
    this.tooltip = description ? `${category}\n\n${description}` : `${category} - ${websites.length} websites`
  }
}

/**
 * Tree item representing a website
 */
export class WebsiteItem extends vscode.TreeItem {
  website: Website
  isFavorite: boolean

  constructor(website: Website, isFavorite = false) {
    super(website.name, vscode.TreeItemCollapsibleState.None)

    this.website = website
    this.isFavorite = isFavorite

    // Set contextValue with both website and favorite status
    this.contextValue = isFavorite ? 'website:favorite' : 'website'

    this.description = website.domain
    this.tooltip = `${website.name}\n${website.domain}\n${website.description}`

    // Use the website's favicon if available
    if (website.favicon) {
      this.iconPath = vscode.Uri.parse(website.favicon)
    } else {
      this.iconPath = new vscode.ThemeIcon('globe')
    }

    // Add command to handle click
    this.command = {
      command: 'llms-txt-extension.viewLlmsTxtContent',
      title: 'View LLMS.txt Content',
      arguments: [this]
    }
  }
}
