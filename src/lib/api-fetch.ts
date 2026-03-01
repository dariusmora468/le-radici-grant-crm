/**
 * Authenticated fetch wrapper for internal API routes.
 * Automatically includes the x-app-password header from sessionStorage.
 * Drop-in replacement for fetch('/api/...', { ... })
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Read password from sessionStorage (set during login)
  const password = typeof window !== 'undefined'
    ? sessionStorage.getItem('grant_crm_password') || ''
    : ''

  const headers = new Headers(options.headers || {})
  headers.set('x-app-password', password)

  // Default to JSON content type for POST requests
  if (options.method === 'POST' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(url, {
    ...options,
    headers,
  })
}
