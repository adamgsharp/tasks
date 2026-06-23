// Server-side GitHub client for reading and writing brain files.
// The token is never exposed to the browser — these helpers run only in
// the /api/chat route and the brain-loading code.

const API = 'https://api.github.com'

function config() {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO // "owner/name"
  const branch = process.env.GITHUB_BRANCH || 'main'
  return { token, repo, branch }
}

export function githubConfigured(): boolean {
  const { token, repo } = config()
  return Boolean(token && repo)
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export interface GitHubFile {
  content: string
  sha: string
}

// In-memory cache so that multiple getFile calls for the same path within one
// request (system prompt build + tool SHA lookup) avoid redundant API round-trips.
const fileCache = new Map<string, { data: GitHubFile | null; expiresAt: number }>()
const CACHE_TTL = 30_000

function cacheKey(path: string, branch: string) {
  return `${branch}\0${path}`
}

function cacheGet(path: string, branch: string): GitHubFile | null | undefined {
  const entry = fileCache.get(cacheKey(path, branch))
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    fileCache.delete(cacheKey(path, branch))
    return undefined
  }
  return entry.data
}

function cacheSet(path: string, branch: string, data: GitHubFile | null) {
  fileCache.set(cacheKey(path, branch), { data, expiresAt: Date.now() + CACHE_TTL })
}

// Reads a file's decoded text and its blob sha (needed for updates).
// Returns null if the file does not exist (404) so callers can create it.
export async function getFile(path: string): Promise<GitHubFile | null> {
  const { token, repo, branch } = config()
  if (!token || !repo) throw new Error('GitHub not configured')

  const cached = cacheGet(path, branch)
  if (cached !== undefined) return cached

  const url = `${API}/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`
  const res = await fetch(url, {
    headers: headers(token),
    cache: 'no-store',
  })

  if (res.status === 404) {
    cacheSet(path, branch, null)
    return null
  }
  if (!res.ok) {
    throw new Error(`GitHub read failed (${res.status}): ${await res.text()}`)
  }

  const data = await res.json()
  const content = Buffer.from(data.content, 'base64').toString('utf-8')
  const file = { content, sha: data.sha }
  cacheSet(path, branch, file)
  return file
}

// Returns the raw base64 content of a file (no UTF-8 decode).
// Use for binary files like images.
// Falls back to the Git Blobs API for files >1MB that the Contents API won't inline.
export async function getFileBase64(path: string): Promise<string | null> {
  const { token, repo, branch } = config()
  if (!token || !repo) throw new Error('GitHub not configured')

  const url = `${API}/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`
  const res = await fetch(url, {
    headers: headers(token),
    cache: 'no-store',
  })

  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`GitHub read failed (${res.status}): ${await res.text()}`)
  }

  const data = await res.json()

  // Small files (<1MB): Contents API returns base64 content directly.
  if (data.content && data.encoding === 'base64') {
    return (data.content as string).replace(/\n/g, '')
  }

  // Large files (>1MB): Contents API omits content; use the Git Blobs API instead.
  if (data.sha) {
    const blobRes = await fetch(`${API}/repos/${repo}/git/blobs/${data.sha}`, {
      headers: headers(token),
      cache: 'no-store',
    })
    if (!blobRes.ok) {
      throw new Error(`Git blob fetch failed (${blobRes.status}): ${await blobRes.text()}`)
    }
    const blob = await blobRes.json()
    return (blob.content as string).replace(/\n/g, '')
  }

  return null
}

// Creates or updates a file. Pass the current sha to update; omit to create.
// Returns the new commit sha. Invalidates the cache for the path so the next
// read reflects the newly-written content.
export async function putFile(
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<string> {
  const { token, repo, branch } = config()
  if (!token || !repo) throw new Error('GitHub not configured')

  const url = `${API}/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    }),
  })

  if (!res.ok) {
    throw new Error(`GitHub write failed (${res.status}): ${await res.text()}`)
  }

  fileCache.delete(cacheKey(path, branch))

  const data = await res.json()
  return data.commit?.sha ?? ''
}
