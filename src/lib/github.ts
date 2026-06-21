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

// Reads a file's decoded text and its blob sha (needed for updates).
// Returns null if the file does not exist (404) so callers can create it.
export async function getFile(path: string): Promise<GitHubFile | null> {
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
  const content = Buffer.from(data.content, 'base64').toString('utf-8')
  return { content, sha: data.sha }
}

// Creates or updates a file. Pass the current sha to update; omit to create.
// Returns the new commit sha.
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

  const data = await res.json()
  return data.commit?.sha ?? ''
}
