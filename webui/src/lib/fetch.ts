/**
 * Try an array of URLs in order, return the first successful Response.
 * @param urls Array of URLs to try
 * @param init Optional RequestInit configuration for fetch
 * @returns Response object
 */
export async function fallbackFetch(urls: string[], init?: RequestInit): Promise<Response> {
  for (const url of urls) {
    try {
      const res = await fetch(url, init)
      if (res.ok) return res
    } catch (e) {
      // Log the first error for debugging, but don't stop execution
      // in case the next URL works
      console.warn(`Failed to fetch ${url}:`, e)
    }
  }
  throw new Error(`All ${urls.length} fetch URLs failed`)
}
