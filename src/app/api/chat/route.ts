import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool } from 'ai'
import { z } from 'zod'
import { buildSystemPrompt } from '@/lib/brain'
import { getFile, getFileBase64, putFile, githubConfigured } from '@/lib/github'

export const runtime = 'nodejs'
export const maxDuration = 60

function brainPaths() {
  return {
    todo: process.env.BRAIN_TODO_PATH ?? 'brain/To Do.md',
    inbox: process.env.BRAIN_INBOX_PATH ?? 'brain/Inbox.md',
    done: process.env.BRAIN_DONE_PATH ?? 'brain/Done.md',
    log: process.env.BRAIN_LOG_PATH ?? 'Brain/Usage Log.md',
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

  const [systemPrompt, inboxFile] = await Promise.all([
    buildSystemPrompt(mode, energy),
    mode === 'triage' && githubConfigured()
      ? getFile(paths.inbox).catch(() => null)
      : Promise.resolve(null),
  ])

  let processedMessages = messages
  let photoCount = 0
  if (inboxFile) {
    const photoMatches = [...inboxFile.content.matchAll(/!\[\[([^\]]+\.(?:jpg|jpeg|png|gif|webp))\]\]/gi)]
    const photos = (
      await Promise.all(
        photoMatches.map(async ([, photoPath]) => {
          const b64 = await getFileBase64(photoPath).catch(() => null)
          if (!b64) return null
          return {
            type: 'image' as const,
            image: Buffer.from(b64, 'base64'),
            mimeType: imageMime(photoPath),
          }
        }),
      )
    ).filter((p): p is NonNullable<typeof p> => p !== null)

    if (photos.length > 0) {
      photoCount = photos.length
      const lastMsg = messages[messages.length - 1]
      const lastContent =
        typeof lastMsg.content === 'string'
          ? [{ type: 'text' as const, text: lastMsg.content }]
          : (lastMsg.content as Array<{ type: string }>)
      processedMessages = [
        ...messages.slice(0, -1),
        { ...lastMsg, content: [...lastContent, ...photos] },
      ]
    }
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
            'Fetch a text file from the vault (markdown notes, etc). For images, photos are already pre-loaded into context — do not call this tool for image paths.',
          parameters: z.object({
            path: z.string().describe('Vault file path, e.g. "Projects/MyNote.md"'),
          }),
          execute: async ({ path }) => {
            try {
              const ext = path.split('.').pop()?.toLowerCase() ?? ''
              if (IMAGE_EXTS.has(ext)) {
                return { ok: false, error: 'Photos are pre-loaded into context. Describe what you see in the image that was provided.' }
              }
              const file = await getFile(path)
              if (!file) return { ok: false, error: 'File not found' }
              return { ok: true, content: file.content }
            } catch (err) {
              return { ok: false, error: err instanceof Error ? err.message : 'read failed' }
            }
          },
        }),
      }
    : undefined

  const result = streamText({
    model: anthropic(model),
    system: systemPrompt,
    messages: processedMessages,
    tools,
    maxSteps: tools ? 8 : 1,
    maxTokens: 8192,
    onFinish: async ({ usage, steps }) => {
      const PRICE_IN = 3.00
      const PRICE_OUT = 15.00
      const costUsd = (
        (usage.promptTokens * PRICE_IN + usage.completionTokens * PRICE_OUT) / 1_000_000
      ).toFixed(4)

      const line =
        `mode=${mode} model=${model} steps=${steps.length} photos=${photoCount}` +
        ` in=${usage.promptTokens} out=${usage.completionTokens} total=${usage.totalTokens} cost=$${costUsd}`
      console.log(`[chat] ${line}`)

      if (!githubConfigured()) return
      try {
        const now = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
        const entry = `- ${now} | ${line}`
        const existing = await getFile(paths.log)
        const newContent = existing
          ? existing.content.trimEnd() + '\n' + entry
          : `# Usage Log\n\n${entry}`
        await putFile(paths.log, newContent, 'tasks: log api usage', existing?.sha)
      } catch {
        // Never let logging errors propagate
      }
    },
  })

  return result.toDataStreamResponse()
}
