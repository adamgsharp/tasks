import { getFile, putFile, githubConfigured } from '@/lib/github'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

const filePaths: Record<string, string> = {
  todo: process.env.BRAIN_TODO_PATH ?? 'brain/To Do.md',
  inbox: process.env.BRAIN_INBOX_PATH ?? 'brain/Inbox.md',
  done: process.env.BRAIN_DONE_PATH ?? 'brain/Done.md',
}

export async function GET(req: Request) {
  const file = new URL(req.url).searchParams.get('file') ?? 'todo'
  const repoPath = filePaths[file] ?? filePaths.todo

  if (githubConfigured()) {
    try {
      const f = await getFile(repoPath)
      return NextResponse.json({ content: f?.content ?? '' })
    } catch {
      // fall through to filesystem
    }
  }

  try {
    const content = fs.readFileSync(path.join(process.cwd(), repoPath), 'utf-8')
    return NextResponse.json({ content })
  } catch {
    return NextResponse.json({ content: '' })
  }
}

export async function PUT(req: Request) {
  const { file, content } = await req.json()
  const repoPath = filePaths[file]
  if (!repoPath) return NextResponse.json({ ok: false, error: 'unknown file' }, { status: 400 })

  if (githubConfigured()) {
    try {
      const existing = await getFile(repoPath)
      await putFile(repoPath, content, `tasks: edit ${file}`, existing?.sha)
      return NextResponse.json({ ok: true })
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : 'write failed' },
        { status: 500 },
      )
    }
  }

  try {
    fs.writeFileSync(path.join(process.cwd(), repoPath), content, 'utf-8')
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'write failed' },
      { status: 500 },
    )
  }
}
