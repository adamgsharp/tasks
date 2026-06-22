import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool } from 'ai'
import { z } from 'zod'
import { buildSystemPrompt } from '@/lib/brain'
import { getFile, putFile, githubConfigured } from '@/lib/github'

export const runtime = 'nodejs'

// Mirrors brainPaths() in brain.ts — both must stay in sync.
function brainPaths() {
  return {
    todo: process.env.BRAIN_TODO_PATH ?? 'brain/To Do.md',
    inbox: process.env.BRAIN_INBOX_PATH ?? 'brain/Inbox.md',
    done: process.env.BRAIN_DONE_PATH ?? 'brain/Done.md',
  }
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          'ANTHROPIC_API_KEY is not set. Add it to your Vercel environment variables and redeploy.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { messages, energy = 'mid', mode = 'chat' } = await req.json()

  const model = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6'
  const canWrite = githubConfigured()
  const paths = brainPaths()

  // Map logical name → actual repo path so Claude uses simple names in the
  // tool but writes to the correct path in whatever vault repo is configured.
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
            file: z
              .enum(['todo', 'inbox', 'done'])
              .describe('Which brain file to write: todo, inbox, or done.'),
            content: z
              .string()
              .describe('The complete new file content (replaces the file).'),
            summary: z
              .string()
              .describe('Short plain commit message describing the change.'),
          }),
          execute: async ({ file, content, summary }) => {
            const repoPath = fileMap[file]
            try {
              const existing = await getFile(repoPath)
              await putFile(repoPath, content, `tasks: ${summary}`, existing?.sha)
              return { ok: true, file, summary }
            } catch (err) {
              return {
                ok: false,
                file,
                error: err instanceof Error ? err.message : 'write failed',
              }
            }
          },
        }),
        save_file_at_path: tool({
          description:
            'Write a file to any path in the vault repo. Use for archiving To Do lists or creating files outside the standard brain files. Always send complete file content.',
          parameters: z.object({
            path: z
              .string()
              .describe('Full repo path (e.g. "To Do/Archived/To Do Lists/To Do - 6-18-26.md")'),
            content: z.string().describe('Complete file content'),
            summary: z.string().describe('Short commit message'),
          }),
          execute: async ({ path, content, summary }) => {
            try {
              const existing = await getFile(path)
              await putFile(path, content, `tasks: ${summary}`, existing?.sha)
              return { ok: true, path, summary }
            } catch (err) {
              return {
                ok: false,
                path,
                error: err instanceof Error ? err.message : 'write failed',
              }
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
