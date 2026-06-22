import { NextRequest, NextResponse } from 'next/server'

const API = 'https://api.github.com'

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  const branch = process.env.GITHUB_BRANCH || 'main'

  if (!token || !repo) {
    return NextResponse.json({ error: 'GitHub not configured' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const filename = `inbox-${ts}.${ext}`
  const path = `Photos/${filename}`

  const url = `${API}/repos/${repo}/contents/${path}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Add inbox photo ${filename}`,
      content: base64,
      branch,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  return NextResponse.json({ path, obsidianLink: `![[${path}]]` })
}
