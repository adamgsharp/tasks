import type { Message } from 'ai'
import ReactMarkdown from 'react-markdown'

interface Props {
  message: Message
}

export default function MessageCard({ message }: Props) {
  if (message.role === 'user') {
    const isCommand = message.content === '/next'
    if (isCommand) {
      return (
        <div className="flex justify-center">
          <span className="text-xs text-stone-400 dark:text-stone-500 bg-stone-100 dark:bg-stone-800 rounded-full px-3 py-1">
            /next
          </span>
        </div>
      )
    }
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-stone-800 dark:bg-stone-200 text-stone-50 dark:text-stone-900 px-4 py-2.5 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    )
  }

  // Surface any successful write-backs so Adam can trust the change landed.
  const saves = (message.toolInvocations ?? []).filter(
    (t) =>
      t.toolName === 'save_brain_file' &&
      t.state === 'result' &&
      (t.result as { ok?: boolean } | undefined)?.ok,
  )

  return (
    <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 px-5 py-4 shadow-sm">
      {message.content && (
        <ReactMarkdown
          className="prose prose-sm prose-stone dark:prose-invert max-w-none
            prose-p:my-1.5 prose-p:leading-relaxed
            prose-strong:font-semibold prose-strong:text-stone-800 dark:prose-strong:text-stone-100
            prose-ul:my-1.5 prose-li:my-0.5
            prose-headings:font-semibold prose-headings:text-stone-800 dark:prose-headings:text-stone-100"
        >
          {message.content}
        </ReactMarkdown>
      )}

      {saves.map((t) => {
        const file = (t.args as { file?: string }).file
        return (
          <div
            key={t.toolCallId}
            className="mt-2 flex items-center gap-1.5 text-xs text-stone-400 dark:text-stone-500"
          >
            <span>✓</span>
            <span>saved to {file}</span>
          </div>
        )
      })}
    </div>
  )
}
