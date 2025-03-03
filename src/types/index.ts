/**
 * Interface representing a website with LLMS.txt information
 */
export interface Website {
  name: string
  domain: string
  description: string
  llmsTxtUrl: string
  llmsFullTxtUrl: string
  category: string
  favicon: string
}

/**
 * Interface for the API response which may have different field names
 */
export interface WebsiteApiResponse {
  name: string
  domain: string
  description: string
  llmsTxtUrl?: string
  llmsUrl?: string
  llmsFullTxtUrl?: string
  llmsFullUrl?: string
  category: string
  favicon: string
}

/**
 * Interface for tree item data
 */
export interface WebsiteTreeItem {
  website: Website
  children?: WebsiteTreeItem[]
}
