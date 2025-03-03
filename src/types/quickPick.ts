import type * as vscode from 'vscode'
import type { Website } from '../types'

/**
 * Interface for QuickPick items with website data
 */
export interface WebsiteQuickPickItem extends vscode.QuickPickItem {
  website: Website
  buttons?: readonly vscode.QuickInputButton[]
}
