import * as vscode from 'vscode'
import { fetchTxtContent } from '../services/websiteService'

/**
 * Copies text to the clipboard
 * @param text Text to copy to clipboard
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await vscode.env.clipboard.writeText(text)
  } catch (error) {
    console.error('Error copying to clipboard:', error)
    throw new Error('Failed to copy to clipboard')
  }
}

/**
 * Fetches and displays text content in a new editor tab
 * @param url URL of the text content to fetch and display
 * @param title Title for the editor tab
 */
export async function viewTxtContent(url: string, title: string): Promise<void> {
  try {
    // Show progress notification
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Fetching ${title}...`,
        cancellable: false
      },
      async () => {
        // Fetch the text content
        const content = await fetchTxtContent(url)

        // Create a new untitled document
        const document = await vscode.workspace.openTextDocument({
          content,
          language: 'plaintext'
        })

        // Show the document in a new editor
        await vscode.window.showTextDocument(document, { preview: false })
      }
    )
  } catch (error) {
    console.error(`Error viewing text content from ${url}:`, error)
    throw new Error(`Failed to view text content from ${url}`)
  }
}

/**
 * Opens a URL in the default web browser
 * @param url URL to open
 */
export async function openInBrowser(url: string): Promise<void> {
  try {
    await vscode.env.openExternal(vscode.Uri.parse(url))
  } catch (error) {
    console.error(`Error opening URL ${url} in browser:`, error)
    throw new Error(`Failed to open URL in browser: ${url}`)
  }
}
