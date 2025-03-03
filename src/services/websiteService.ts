import axios from 'axios'
import type { Website, WebsiteApiResponse } from '../types'

// URL to the websites JSON data
const WEBSITES_URL =
  'https://raw.githubusercontent.com/thedaviddias/llms-txt-hub/refs/heads/main/data/websites.json'

/**
 * Fetches the list of websites from the GitHub repository
 * @returns Promise with array of Website objects
 */
export async function fetchWebsites(): Promise<Website[]> {
  try {
    const response = await axios.get<WebsiteApiResponse[]>(WEBSITES_URL)

    // Map the response data to match our Website interface
    // This handles any potential field name mismatches
    return response.data.map(site => ({
      name: site.name,
      domain: site.domain,
      description: site.description,
      llmsTxtUrl: site.llmsTxtUrl || site.llmsUrl || '',
      llmsFullTxtUrl: site.llmsFullTxtUrl || site.llmsFullUrl || '',
      category: site.category,
      favicon: site.favicon,
      publishedAt: site.publishedAt
    }))
  } catch (error) {
    console.error('Error fetching websites:', error)
    throw new Error('Failed to fetch websites data')
  }
}

/**
 * Fetches the content of a text file from a URL
 * @param url URL of the text file to fetch
 * @returns Promise with the text content
 */
export async function fetchTxtContent(url: string): Promise<string> {
  try {
    const response = await axios.get<string>(url, {
      headers: {
        Accept: 'text/plain'
      }
    })
    return response.data
  } catch (error) {
    console.error(`Error fetching text content from ${url}:`, error)
    throw new Error(`Failed to fetch text content from ${url}`)
  }
}
