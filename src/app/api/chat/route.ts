import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool } from 'ai'
import { z } from 'zod'
import { buildSystemPrompt } from '@/lib/brain'
import { getFile, getFileBase64, putFile, githubConfigured } from '@/lib/github'

export const runtime = 'nodejs'

function brainPaths() {
  return {
    todo: process.env.BRAIN_TODO_PATH ?? 'brain/To Do.md',
    inbox: process.env.BRAIN_INBOX_PATH ?? 'brain/Inbox.md',
    done: process.env.BRAIN_DONE_PATH ?? 'brain/Done.md',
  }
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])

function imageMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? 'jpg'
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { messages, energy = 'mid', mode = 'chat' } = await req.json()

  const model = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6'
  const canWrite = githubConfigured()
  const paths = brainPaths()

  const fileMap: Record<string, string> = {
    todo: paths.todo,
    inbox: paths.inbox,
    done: paths.done,
  }

  const tools = canWrite
    ? {
        save_brain_file: tool({
          description:
            'Overwrite a brain file with complete new content and commit it to the vault. Use "inbox" to capture, "todo" to file/organize tasks, "done" to mark complete or log today\'s win. Always send the full file content, not a fragment.',
          parameters: z.object({
            file: z.enum(['todo', 'inbox', 'done']).describe('Which brain file to write.'),
            content: z.string().describe('The complete new file content (replaces the file).'),
            summary: z.string().describe('Short plain commit message describing the change.'),
          }),
          execute: async ({ file, content, summary }) => {
            const repoPath = fileMap[file]
            try {
              const existing = await getFile(repoPath)
              await putFile(repoPath, content, `tasks: ${summary}`, existing?.sha)
              return { ok: true, file, summary }
            } catch (err) {
              return { ok: false, file, error: err instanceof Error ? err.message : 'write failed' }
            }
          },
        }),

        save_file_at_path: tool({
          description:
            'Write a file to any path in the vault repo. Use for archiving To Do lists or creating files outside the standard brain files. Always send complete file content.',
          parameters: z.object({
            path: z.string().describe('Full repo path (e.g. "To Do/Archived/To Do Lists/To Do - 6-18-26.md")'),
            content: z.string().describe('Complete file content'),
            summary: z.string().describe('Short commit message'),
          }),
          execute: async ({ path, content, summary }) => {
            try {
              const existing = await getFile(path)
              await putFile(path, content, `tasks: ${summary}`, existing?.sha)
              return { ok: true, path, summary }
            } catch (err) {
              return { ok: false, path, error: err instanceof Error ? err.message : 'write failed' }
            }
          },
        }),

        read_vault_file: tool({
          description:
            'Read any file from the vault repository. When you see an image reference like ![[Photos/...]] in brain files, call this tool with that path to view the actual image. Also works for reading any other vault file by path.',
          parameters: z.object({
            path: z.string().describe('Vault file path, e.g. "Photos/inbox-20260622043324.jpeg"'),
          }),
          execute: async ({ path }) => {
            try {
              const ext = path.split('.').pop()?.toLowerCase() ?? ''
              if (IMAGE_EXTS.has(ext)) {
                const b64 = await getFileBase64(path)
                if (!b64) return { ok: false, error: 'File not found' }
                return {
                  content: [{
                    type: 'image' as const,
                    data: b64,
                    mimeType: imageMime(path),
                  }],
                }
              } else {
                const file = await getFile(path)
                if (!file) return { ok: false, error: 'File not found' }
                return { ok: true, content: file.content }
              }
            } catch (err) {
              return { ok: false, error: err instanceof Error ? err.message : 'read failed' }
            }
          },
        }),
      }
    : undefined

  const result = streamText({
    model: anthropic(model),
    system: await buildSystemPrompt(mode, energy),
    messages,
    tools,
    maxSteps: tools ? 8 : 1,
    maxTokens: 8192,
  })

  return result.toDataStreamResponse()
}
