// Set VITE_API_BASE_URL in Amplify's build environment variables to point
// at the real backend once it's live (e.g. on Lightsail). Falls back to the
// local dev backend when the variable isn't set.
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const TOKEN_KEY = 'ranco_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, detail)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

async function fetchPdfBlob(path: string, onEarlyFailure?: () => void): Promise<Blob> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { headers })
  } catch (err) {
    onEarlyFailure?.()
    throw err
  }

  if (!res.ok) {
    onEarlyFailure?.()
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, detail)
  }

  return res.blob()
}

/**
 * Fetches a file (PDF) and opens it in a new browser tab (the browser's
 * native PDF viewer takes over) rather than forcing an immediate download —
 * no `download` attribute, so it displays instead of saving to disk.
 * NOTE: this is the web-only path. Doesn't work the same way inside a
 * Capacitor WebView; that'll need @capacitor/filesystem + @capacitor/share
 * instead, swapped in behind a platform check, whenever this gets wrapped
 * as a native app.
 */
export async function viewPdf(path: string): Promise<void> {
  // Open the tab synchronously, before the async fetch below — calling
  // window.open() after an await loses its "direct result of a user
  // gesture" standing and most browsers silently block it as a popup.
  const newTab = window.open('', '_blank')
  const blob = await fetchPdfBlob(path, () => newTab?.close())

  const url = URL.createObjectURL(blob)
  if (newTab) {
    // Blob URL is intentionally not revoked here — the new tab needs it to
    // actually render the PDF; the browser reclaims it when that tab closes.
    newTab.location.href = url
  } else {
    // Popup was blocked despite opening synchronously (rare) — fall back to
    // opening after the fact rather than losing the PDF entirely.
    window.open(url, '_blank')
  }
}

/**
 * Fetches a file (PDF) and forces an actual save-to-disk download (a fake
 * `<a download>` click), as opposed to viewPdf's "open in a new tab" —
 * this is the web-only download path. Doesn't work the same way inside a
 * Capacitor WebView; see viewPdf's note above.
 */
export async function savePdf(path: string, filenameHint = 'document.pdf'): Promise<void> {
  const blob = await fetchPdfBlob(path)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filenameHint
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}