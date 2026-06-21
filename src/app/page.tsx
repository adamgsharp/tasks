'use client'

import { useChat } from 'ai/react'
import { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import EngineCheck, { type Energy } from '@/components/EngineCheck'
import MessageCard from '@/components/MessageCard'

export default function Home() {
  const [energy, setEnergy] = useState<Energy>('mid')
  const [mode, setMode] = useState<'inbox' | 'next' | 'chat'>('chat')
  const [kbHeight, setKbHeight] = useState(0)
  const [showTodo, setShowTodo] = useState(false)
  const [todoContent, setTodoContent] = useState<string | null>(null)
  const [todoLoading, setTodoLoading] = useState(false)

  const energyRef = useRef(energy)
  const modeRef = useRef(mode)
  useEffect(() => { energyRef.current = energy }, [energy])
  useEffect(() => { modeRef.current = mode }, [mode])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { messages, input, setInput, isLoading, append } = useChat({
    body: { energy: energyRef.current, mode: modeRef.current },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Pin container height to the visual viewport so it always ends just above
  // the keyboard. On every vv.resize/scroll:
  //  1. Set container height = vv.height (correct end-state regardless of animation frame)
  //  2. If iOS scrolled the page to reveal the textarea (vv.offsetTop > 0), undo
  //     it via requestAnimationFrame — deferred so we don't cancel mid-animation
  //     keyboard resize events the way a synchronous scrollTo did.
  //  3. Scroll the messages container directly (not scrollIntoView, which on iOS
  //     can aggressively scroll the window and fight the viewport reset).
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      if (containerRef.current) containerRef.current.style.height = `${vv.height}px`
      if (vv.offsetTop > 0) {
        requestAnimationFrame(() => window.scrollTo(0, 0))
      }
      const kb = Math.max(0, window.innerHeight - vv.height)
      setKbHeight(kb)
      if (kb > 0) {
        setTimeout(() => {
          if (mainRef.current) mainRef.current.scrollTop = mainRef.current.scrollHeight
        }, 50)
      }
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  const resizeTextarea = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const submit = () => {
    const text = input.trim()
    if (!text || isLoading) return
    append(
      { role: 'user', content: text },
      { body: { energy: energyRef.current, mode: modeRef.current } },
    )
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const triggerNext = () => {
    if (isLoading) return
    setMode('next')
    append(
      { role: 'user', content: '/next' },
      { body: { energy: energyRef.current, mode: 'next' } },
    )
  }

  const activateInbox = () => {
    setMode('inbox')
    textareaRef.current?.focus()
  }

  const openTodo = async () => {
    setShowTodo(true)
    setTodoLoading(true)
    setTodoContent(null)
    const res = await fetch('/api/brain?file=todo')
    const data = await res.json()
    setTodoContent(data.content)
    setTodoLoading(false)
  }

  return (
    <div ref={containerRef} className="fixed top-0 inset-x-0 flex flex-col max-w-lg mx-auto" style={{ height: '100svh' }}>
      {showTodo && (
        <div className="absolute inset-0 z-10 flex flex-col bg-stone-50 dark:bg-stone-950">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
            <span className="text-sm font-medium text-stone-600 dark:text-stone-400">To Do</span>
            <button
              onClick={() => setShowTodo(false)}
              aria-label="Close"
              className="text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {todoLoading ? (
              <p className="text-stone-400 dark:text-stone-500 text-sm animate-pulse">Loading…</p>
            ) : todoContent ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{todoContent}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-stone-400 dark:text-stone-500 text-sm">Nothing here.</p>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-safe border-b border-stone-100 dark:border-stone-800 py-3">
        <span className="text-stone-600 dark:text-stone-400 font-medium tracking-tight select-none">
          tasks
        </span>
        <button
          onClick={openTodo}
          className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors select-none"
        >
          todo
        </button>
        <EngineCheck energy={energy} onChange={setEnergy} />
      </header>

      {/* Messages */}
      <main ref={mainRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center select-none">
            <p className="text-stone-400 dark:text-stone-500 text-sm">
              What&apos;s on your mind?
            </p>
            <p className="text-stone-300 dark:text-stone-600 text-xs leading-relaxed max-w-[200px]">
              Dump something to clear it,<br />or tap /next for the right thing now.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <MessageCard key={m.id} message={m} />
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 px-5 py-4 shadow-sm">
            <span className="text-stone-300 dark:text-stone-600 text-sm animate-pulse">···</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input area — padding-bottom gives safe-area clearance when keyboard
          is hidden; a small gap when it's open (container already ends just
          above the keyboard so no large offset needed). */}
      <footer
        className="border-t border-stone-100 dark:border-stone-800 px-4 pt-3 space-y-2.5"
        style={{ paddingBottom: kbHeight > 0 ? '8px' : 'max(env(safe-area-inset-bottom, 12px), 12px)' }}
      >
        {mode !== 'chat' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400 dark:text-stone-500">
              mode:{' '}
              <span className="text-stone-600 dark:text-stone-300 font-medium">/{mode}</span>
            </span>
            <button
              onClick={() => setMode('chat')}
              aria-label="Clear mode"
              className="text-xs text-stone-300 hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400 leading-none"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            placeholder={mode === 'inbox' ? "What's the ugh?" : "What's on your mind?"}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2.5 text-base text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600 transition-shadow"
            onChange={(e) => {
              setInput(e.target.value)
              resizeTextarea()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <button
            onClick={submit}
            disabled={isLoading || !input.trim()}
            aria-label="Send"
            className="rounded-xl bg-stone-800 dark:bg-stone-200 text-stone-50 dark:text-stone-900 w-10 h-10 flex items-center justify-center text-base font-medium disabled:opacity-25 hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors flex-shrink-0"
          >
            {isLoading ? '·' : '↑'}
          </button>
        </div>

        <div className="flex gap-2 pb-1">
          <button
            onClick={triggerNext}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-stone-200 dark:border-stone-700 py-2 text-xs text-stone-500 dark:text-stone-400 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-700 dark:hover:text-stone-200 transition-colors disabled:opacity-30"
          >
            /next
          </button>
          <button
            onClick={activateInbox}
            className={`flex-1 rounded-lg border py-2 text-xs transition-colors ${
              mode === 'inbox'
                ? 'border-stone-400 dark:border-stone-500 text-stone-700 dark:text-stone-200 bg-stone-100 dark:bg-stone-800'
                : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-700 dark:hover:text-stone-200'
            }`}
          >
            /inbox
          </button>
        </div>
      </footer>
    </div>
  )
}
