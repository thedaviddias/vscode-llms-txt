import * as vscode from 'vscode'
import { WebsitesProvider } from './providers/websitesProvider'
import { FavoritesProvider } from './providers/favoritesProvider'
import type { Website, WebsiteQuickPickItem } from './types'
import { fetchTxtContent } from './services/websiteService'
import type { TreeItemType } from './providers/websitesProvider'
import { WebsiteItem } from './treeItems'
import { viewTxtContent } from './utils'

export function activate(context: vscode.ExtensionContext) {
  console.log('LLMS.txt Extension is now active')

  // Create the websites provider
  const websitesProvider = new WebsitesProvider(context)
  console.log('WebsitesProvider created')

  // Create the favorites provider
  const favoritesProvider = new FavoritesProvider(context)
  console.log('FavoritesProvider created')

  // Connect the providers
  websitesProvider.setFavoritesProvider(favoritesProvider)

  // Initial load of websites
  console.log('Starting initial website load...')
  websitesProvider.refresh().then(() => {
    console.log('Initial website load completed successfully')

    // Register the tree data providers for the views
    const websitesView = vscode.window.createTreeView('llmsTxtWebsites', {
      treeDataProvider: websitesProvider,
      showCollapseAll: true
    })
    console.log('Websites TreeView created')

    const favoritesView = vscode.window.createTreeView('llmsTxtFavorites', {
      treeDataProvider: favoritesProvider
    })
    console.log('Favorites TreeView created')

    // Update the provider with the tree view reference
    websitesProvider.setTreeView(websitesView)
    console.log('TreeView reference set in provider')

    // Register commands and set up event handlers
    setupCommands(context, websitesProvider, favoritesProvider, websitesView)
  }).catch(error => {
    console.error('Error during initial website load:', error)
    if (error instanceof Error) {
      const errorMessage = `Failed to load websites: ${error.message}`
      console.error(errorMessage)
      vscode.window.showErrorMessage(errorMessage)
    } else {
      console.error('Failed to load websites: Unknown error')
      vscode.window.showErrorMessage('Failed to load websites: Unknown error')
    }
  })
}

function setupCommands(
  context: vscode.ExtensionContext,
  websitesProvider: WebsitesProvider,
  favoritesProvider: FavoritesProvider,
  treeView: vscode.TreeView<TreeItemType>
) {
  // Register the search command
  const searchDisposable = vscode.commands.registerCommand('llms-txt-extension.searchWebsites', async () => {
    const websites = websitesProvider.getAllWebsites()
    const quickPick = vscode.window.createQuickPick<WebsiteQuickPickItem>()

    // Set up initial state
    quickPick.placeholder = 'Search websites... (Type to see fuzzy matches)'
    quickPick.matchOnDescription = true
    quickPick.matchOnDetail = true

    // Initial items (show all websites)
    quickPick.items = websites.map(createQuickPickItem)

    // Update items as user types with fuzzy search
    quickPick.onDidChangeValue(async value => {
      // Update tree view filter to sync the panel
      websitesProvider.updateSearch(value)

      // Get search results for actual websites
      const searchResults = websitesProvider.searchWebsites(value)

      const items: WebsiteQuickPickItem[] = []

      // Only show suggestions if we have a partial query
      if (value.length >= 2) {
        // Get recent searches that match the current input
        const suggestions = websitesProvider.getSearchSuggestions(value)
          .filter(suggestion => suggestion.toLowerCase() !== value.toLowerCase()) // Don't suggest exact matches
          .slice(0, 3) // Limit to top 3 suggestions
          .map(suggestion => ({
            label: `$(history) ${suggestion}`,
            description: 'Recent search',
            alwaysShow: true,
            suggestion: true
          }))

        if (suggestions.length > 0) {
          items.push(...suggestions)

          // Add a separator if we have both suggestions and results
          if (searchResults.length > 0) {
            items.push({
              label: '$(dash) Websites',
              kind: vscode.QuickPickItemKind.Separator
            } as WebsiteQuickPickItem)
          }
        }
      }

      // Add actual website results
      items.push(...searchResults.map(createQuickPickItem))

      quickPick.items = items
    })

    // Handle selection
    quickPick.onDidAccept(() => {
      const selection = quickPick.selectedItems[0]
      if (selection) {
        if ('suggestion' in selection) {
          // If a suggestion was selected, update the search text
          const newValue = selection.label.replace('$(history) ', '')
          if (newValue) {
            quickPick.value = newValue
          }
        } else if (selection.website) {
          // If a website was selected, reveal it in the tree
          const treeItem = websitesProvider.getTreeItemForWebsite(selection.website)
          if (treeItem) {
            treeView.reveal(treeItem, { expand: true, select: true })
          }
          quickPick.hide()
        }
      }
    })

    // Handle button clicks
    quickPick.onDidTriggerItemButton(async event => {
      const item = event.item
      if (!('website' in item) || !item.website) {
        return
      }

      const buttons = item.buttons
      if (!buttons) {
        return
      }

      const website = item.website

      // LLMS.txt: Copy URL
      if (event.button === buttons[0] && website.llmsTxtUrl) {
        await vscode.env.clipboard.writeText(website.llmsTxtUrl)
        vscode.window.showInformationMessage(`Copied ${website.name} LLMS.txt URL to clipboard`)
      }
      // LLMS.txt: View Content
      else if (event.button === buttons[1] && website.llmsTxtUrl) {
        try {
          await viewTxtContent(website.llmsTxtUrl, `${website.name} - LLMS.txt`)
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to fetch LLMS.txt content: ${error}`)
        }
      }
      // LLMS Full.txt: Copy URL
      else if (event.button === buttons[2] && website.llmsFullTxtUrl) {
        await vscode.env.clipboard.writeText(website.llmsFullTxtUrl)
        vscode.window.showInformationMessage(`Copied ${website.name} LLMS Full.txt URL to clipboard`)
      }
      // LLMS Full.txt: View Content
      else if (event.button === buttons[3] && website.llmsFullTxtUrl) {
        try {
          await viewTxtContent(website.llmsFullTxtUrl, `${website.name} - LLMS Full.txt`)
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to fetch LLMS Full.txt content: ${error}`)
        }
      }
      // Visit Website
      else if (event.button === buttons[4]) {
        await vscode.env.openExternal(vscode.Uri.parse(website.domain))
      }
    })

    // Clear search when QuickPick is hidden
    quickPick.onDidHide(() => {
      websitesProvider.clearSearch()
      quickPick.dispose()
    })

    quickPick.show()
  })

  // Register clear search command
  const clearSearchDisposable = vscode.commands.registerCommand('llms-txt-extension.clearSearch', () => {
    websitesProvider.clearSearch()
    vscode.window.showInformationMessage('Search cleared')
  })

  context.subscriptions.push(treeView, searchDisposable, clearSearchDisposable)

  // Track the collapsed state to toggle between collapse all and expand all
  let isCollapsed = false

  // Override the built-in collapse all button to toggle between collapse and expand
  context.subscriptions.push(
    vscode.commands.registerCommand('workbench.actions.treeView.llmsTxtWebsites.collapseAll', async () => {
      try {
        if (!isCollapsed) {
          // Default behavior - collapse all
          await vscode.commands.executeCommand('list.collapseAll')
          isCollapsed = true
        } else {
          // Expand all categories
          const categories = websitesProvider.getRootItems()
          for (const category of categories) {
            await treeView.reveal(category, { expand: true })
          }
          isCollapsed = false
          vscode.window.showInformationMessage('All categories expanded')
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to toggle tree view: ${error}`)
      }
    })
  )

  // Register the refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('llms-txt-extension.refreshWebsites', () => {
      websitesProvider.refresh();
    })
  )

  // Register add to favorites command
  context.subscriptions.push(
    vscode.commands.registerCommand('llms-txt-extension.addToFavorites', async (item: TreeItemType) => {
      if (item instanceof WebsiteItem) {
        await favoritesProvider.addFavorite(item.website)
        // Refresh both views to update the UI
        websitesProvider.refresh()
      }
    })
  )

  // Register remove from favorites command
  context.subscriptions.push(
    vscode.commands.registerCommand('llms-txt-extension.removeFromFavorites', async (item: TreeItemType) => {
      if (item instanceof WebsiteItem) {
        await favoritesProvider.removeFavorite(item.website)
        // Refresh both views to update the UI
        websitesProvider.refresh()
      }
    })
  )

  // Register the copy LLMS.txt URL command
  context.subscriptions.push(
    vscode.commands.registerCommand('llms-txt-extension.copyLlmsTxtUrl', async (item: TreeItemType) => {
      if (!(item instanceof WebsiteItem)) {
        return;
      }
      if (!item.website.llmsTxtUrl) {
        vscode.window.showErrorMessage(`No LLMS.txt URL available for ${item.website.name}`);
        return;
      }
      await vscode.env.clipboard.writeText(item.website.llmsTxtUrl);
      vscode.window.showInformationMessage('LLMS.txt URL copied to clipboard');
    })
  )

  // Register the copy LLMS Full.txt URL command
  context.subscriptions.push(
    vscode.commands.registerCommand('llms-txt-extension.copyLlmsFullTxtUrl', async (item: TreeItemType) => {
      if (!(item instanceof WebsiteItem)) {
        return;
      }
      if (!item.website.llmsFullTxtUrl) {
        vscode.window.showErrorMessage(`No LLMS Full.txt URL available for ${item.website.name}`);
        return;
      }
      await vscode.env.clipboard.writeText(item.website.llmsFullTxtUrl);
      vscode.window.showInformationMessage('LLMS Full.txt URL copied to clipboard');
    })
  )

  // Register the view LLMS.txt content command
  context.subscriptions.push(
    vscode.commands.registerCommand('llms-txt-extension.viewLlmsTxtContent', async (item: TreeItemType) => {
      if (!(item instanceof WebsiteItem)) {
        return;
      }
      try {
        if (!item.website.llmsTxtUrl) {
          vscode.window.showErrorMessage(`No LLMS.txt content available for ${item.website.name}`);
          return;
        }
        await viewTxtContent(item.website.llmsTxtUrl, `${item.website.name} - LLMS.txt`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to view LLMS.txt content: ${error}`);
      }
    })
  )

  // Register the view LLMS Full.txt content command
  context.subscriptions.push(
    vscode.commands.registerCommand('llms-txt-extension.viewLlmsFullTxtContent', async (item: TreeItemType) => {
      if (!(item instanceof WebsiteItem)) {
        return;
      }
      try {
        if (!item.website.llmsFullTxtUrl) {
          vscode.window.showErrorMessage(`No LLMS Full.txt content available for ${item.website.name}`);
          return;
        }
        await viewTxtContent(item.website.llmsFullTxtUrl, `${item.website.name} - LLMS Full.txt`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to view LLMS Full.txt content: ${error}`);
      }
    })
  )

  // Register the visit website command
  context.subscriptions.push(
    vscode.commands.registerCommand('llms-txt-extension.visitWebsite', (item: TreeItemType) => {
      if (item instanceof WebsiteItem) {
        vscode.env.openExternal(vscode.Uri.parse(`${item.website.domain}`));
      }
    })
  )

  // Register the category filter command
  context.subscriptions.push(
    vscode.commands.registerCommand('llms-txt-extension.filterByCategory', async () => {
      const categories = websitesProvider.getCategories()
      const quickPick = vscode.window.createQuickPick()

      quickPick.items = categories.map(category => ({
        label: category,
        description: 'Filter by this category'
      }))

      quickPick.placeholder = 'Select a category to filter by...'

      quickPick.onDidAccept(() => {
        const selection = quickPick.selectedItems[0]
        if (selection) {
          websitesProvider.setCurrentCategory(selection.label)
          vscode.window.showInformationMessage(`Filtered by category: ${selection.label}`)
        }
        quickPick.hide()
      })

      quickPick.show()
    })
  )

  // Register the clear category filter command
  context.subscriptions.push(
    vscode.commands.registerCommand('llms-txt-extension.clearCategoryFilter', () => {
      websitesProvider.clearCategoryFilter()
      vscode.window.showInformationMessage('Category filter cleared')
    })
  )
}

function createQuickPickItem(website: Website): WebsiteQuickPickItem {
  return {
    label: website.name,
    description: website.domain,
    detail: website.description,
    website,
    iconPath: website.favicon ? vscode.Uri.parse(website.favicon) : new vscode.ThemeIcon('globe'),
    buttons: [
      {
        iconPath: new vscode.ThemeIcon('copy'),
        tooltip: 'LLMS.txt: Copy URL'
      },
      {
        iconPath: new vscode.ThemeIcon('eye'),
        tooltip: 'LLMS.txt: View Content'
      },
      {
        iconPath: new vscode.ThemeIcon('copy'),
        tooltip: 'LLMS Full.txt: Copy URL'
      },
      {
        iconPath: new vscode.ThemeIcon('eye'),
        tooltip: 'LLMS Full.txt: View Content'
      },
      {
        iconPath: new vscode.ThemeIcon('globe'),
        tooltip: 'Visit Website'
      }
    ]
  }
}

export function deactivate() {}
