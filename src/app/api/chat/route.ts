import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool } from 'ai'
import { z } from 'zod'
import { buildSystemPrompt } from '@/lib/brain'
import { getFile, putFile, githubConfigured } from '@/lib/github'

export const runtime = 'nodejs'

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

  // Only expose the write-back tool when GitHub is configured. Without it the
  // app stays read-only and behaves exactly as before.
  const tools = canWrite
    ? {
        save_brain_file: tool({
          description:
            'Overwrite a brain file with complete new content and commit it to the vault. Use to capture to inbox.md or file/organize tasks in todo.md. Always send the full file content, not a fragment.',
          parameters: z.object({
            file: z
              .enum(['inbox.md', 'todo.md'])
              .describe('Which brain file to write.'),
            content: z
              .string()
              .describe('The complete new file content (replaces the file).'),
            summary: z
              .string()
              .describe('Short plain commit message describing the change.'),
          }),
          execute: async ({ file, content, summary }) => {
            try {
              const existing = await getFile(`brain/${file}`)
              await putFile(
                `brain/${file}`,
                content,
                `tasks: ${summary}`,
                existing?.sha,
              )
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
      }
    : undefined

  const result = streamText({
    model: anthropic(model),
    system: await buildSystemPrompt(mode, energy),
    messages,
    tools,
    maxSteps: tools ? 3 : 1,
    maxTokens: 1024,
  })

  return result.toDataStreamResponse()
}
