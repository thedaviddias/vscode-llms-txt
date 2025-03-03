import * as vscode from 'vscode'
import type { Website } from '../types'
import { WebsiteItem } from '../treeItems'

export class FavoritesProvider implements vscode.TreeDataProvider<WebsiteItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<WebsiteItem | undefined | null> =
    new vscode.EventEmitter<WebsiteItem | undefined | null>()
  readonly onDidChangeTreeData: vscode.Event<WebsiteItem | undefined | null> =
    this._onDidChangeTreeData.event

  private static readonly FAVORITES_KEY = 'favoriteWebsites'
  private favorites: Website[] = []
  private context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext) {
    this.context = context
    this.loadFavorites()
  }

  private loadFavorites(): void {
    const savedFavorites = this.context.globalState.get<Website[]>(FavoritesProvider.FAVORITES_KEY, [])
    this.favorites = savedFavorites
  }

  private async saveFavorites(): Promise<void> {
    await this.context.globalState.update(FavoritesProvider.FAVORITES_KEY, this.favorites)
  }

  async addFavorite(website: Website): Promise<void> {
    if (!this.favorites.some(fav => fav.domain === website.domain)) {
      this.favorites.push(website)
      await this.saveFavorites()
      this._onDidChangeTreeData.fire(undefined)
      vscode.window.showInformationMessage(`Added ${website.name} to favorites`)
    }
  }

  async removeFavorite(website: Website): Promise<void> {
    const index = this.favorites.findIndex(fav => fav.domain === website.domain)
    if (index !== -1) {
      this.favorites.splice(index, 1)
      await this.saveFavorites()
      this._onDidChangeTreeData.fire(undefined)
      vscode.window.showInformationMessage(`Removed ${website.name} from favorites`)
    }
  }

  isFavorite(website: Website): boolean {
    return this.favorites.some(fav => fav.domain === website.domain)
  }

  getTreeItem(element: WebsiteItem): vscode.TreeItem {
    return element
  }

  getChildren(): vscode.ProviderResult<WebsiteItem[]> {
    return this.favorites.map(website => new WebsiteItem(website))
  }
}
