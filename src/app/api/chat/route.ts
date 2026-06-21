import { anthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import { buildSystemPrompt } from '@/lib/brain'

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

  const result = streamText({
    model: anthropic(model),
    system: buildSystemPrompt(mode, energy),
    messages,
    maxTokens: 1024,
  })

  return result.toDataStreamResponse()
}
