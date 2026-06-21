import { getFile, githubConfigured } from '@/lib/github'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const file = new URL(req.url).searchParams.get('file') ?? 'todo'

  const paths: Record<string, string> = {
    todo: process.env.BRAIN_TODO_PATH ?? 'brain/To Do.md',
    inbox: process.env.BRAIN_INBOX_PATH ?? 'brain/Inbox.md',
    done: process.env.BRAIN_DONE_PATH ?? 'brain/Done.md',
  }

  const repoPath = paths[file] ?? paths.todo

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
