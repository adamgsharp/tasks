'use client'

import { useChat } from 'ai/react'
import { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import EngineCheck, { type Energy } from '@/components/EngineCheck'
import MessageCard from '@/components/MessageCard'

type Tab = 'chat' | 'next' | 'inbox' | 'todo'

const TAB_LABELS: Record<Tab, string> = {
  chat: 'Chat',
  next: 'Next',
  inbox: 'Inbox',
  todo: 'To Do',
}

export default function Home() {
  const [energy, setEnergy] = useState<Energy>('mid')
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [kbHeight, setKbHeight] = useState(0)

  const [inboxContent, setInboxContent] = useState<string | null>(null)
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxEditing, setInboxEditing] = useState(false)
  const [inboxEditValue, setInboxEditValue] = useState('')
  const [inboxSaving, setInboxSaving] = useState(false)

  const [todoContent, setTodoContent] = useState<string | null>(null)
  const [todoLoading, setTodoLoading] = useState(false)
  const [todoEditing, setTodoEditing] = useState(false)
  const [todoEditValue, setTodoEditValue] = useState('')
  const [todoSaving, setTodoSaving] = useState(false)

  const energyRef = useRef(energy)
  const activeTabRef = useRef(activeTab)
  const nextFired = useRef(false)
  useEffect(() => { energyRef.current = energy }, [energy])
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { messages, input, setInput, isLoading, append } = useChat({
    body: { energy: energyRef.current, mode: 'chat' },
  })

  // Auto-fire /next on first visit when there's no chat history yet
  useEffect(() => {
    if (activeTab === 'next' && messages.length === 0 && !nextFired.current && !isLoading) {
      nextFired.current = true
      append(
        { role: 'user', content: '/next' },
        { body: { energy: energyRef.current, mode: 'next' } },
      )
    }
  }, [activeTab, messages.length, isLoading])

  // Load file tabs on first open
  useEffect(() => {
    if (activeTab === 'inbox' && inboxContent === null && !inboxLoading) loadInbox()
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'todo' && todoContent === null && !todoLoading) loadTodo()
  }, [activeTab])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Pin container to visual viewport height to keep input above keyboard on iOS
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      if (containerRef.current) containerRef.current.style.height = `${vv.height}px`
      if (vv.offsetTop > 0) requestAnimationFrame(() => window.scrollTo(0, 0))
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
    const mode = activeTabRef.current === 'next' ? 'next' : 'chat'
    append(
      { role: 'user', content: text },
      { body: { energy: energyRef.current, mode } },
    )
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const loadInbox = async () => {
    setInboxLoading(true)
    const res = await fetch('/api/brain?file=inbox')
    const data = await res.json()
    setInboxContent(data.content)
    setInboxLoading(false)
  }

  const loadTodo = async () => {
    setTodoLoading(true)
    const res = await fetch('/api/brain?file=todo')
    const data = await res.json()
    setTodoContent(data.content)
    setTodoLoading(false)
  }

  const saveFile = async (file: 'inbox' | 'todo', content: string) => {
    const res = await fetch('/api/brain', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, content }),
    })
    return res.ok
  }

  const saveInbox = async () => {
    setInboxSaving(true)
    const ok = await saveFile('inbox', inboxEditValue)
    if (ok) { setInboxContent(inboxEditValue); setInboxEditing(false) }
    setInboxSaving(false)
  }

  const saveTodo = async () => {
    setTodoSaving(true)
    const ok = await saveFile('todo', todoEditValue)
    if (ok) { setTodoContent(todoEditValue); setTodoEditing(false) }
    setTodoSaving(false)
  }

  const ingestInbox = () => {
    setActiveTab('chat')
    append(
      { role: 'user', content: '/triage' },
      { body: { energy: energyRef.current, mode: 'triage' } },
    )
  }

  const isChatTab = activeTab === 'chat' || activeTab === 'next'

  return (
    <div ref={containerRef} className="fixed top-0 inset-x-0 flex flex-col max-w-lg mx-auto" style={{ height: '100svh' }}>

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-safe border-b border-stone-100 dark:border-stone-800 py-3 flex-shrink-0">
        <span className="text-stone-600 dark:text-stone-400 font-medium tracking-tight select-none">
          tasks
        </span>
        <EngineCheck energy={energy} onChange={setEnergy} />
      </header>

      {/* Chat / Next tab content */}
      {isChatTab && (
        <>
          <main ref={mainRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
            {messages.length === 0 && !isLoading && (
              <div className="flex items-center justify-center h-full select-none">
                <p className="text-stone-400 dark:text-stone-500 text-sm">
                  {activeTab === 'next' ? 'Getting your next thing…' : "What's on your mind?"}
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

          <footer
            className="border-t border-stone-100 dark:border-stone-800 px-4 pt-3 flex-shrink-0"
            style={{ paddingBottom: kbHeight > 0 ? '8px' : 'max(env(safe-area-inset-bottom, 12px), 12px)' }}
          >
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                placeholder="What's on your mind?"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2.5 text-base text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600 transition-shadow"
                onChange={(e) => { setInput(e.target.value); resizeTextarea() }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
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
          </footer>
        </>
      )}

      {/* Inbox tab content */}
      {activeTab === 'inbox' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100 dark:border-stone-800 flex-shrink-0">
            <button
              onClick={ingestInbox}
              className="text-xs font-medium text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-1.5 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
            >
              Ingest Inbox
            </button>
            <div className="flex items-center gap-3">
              {inboxEditing ? (
                <>
                  <button
                    onClick={() => setInboxEditing(false)}
                    className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveInbox}
                    disabled={inboxSaving}
                    className="text-xs font-medium text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 hover:border-stone-500 dark:hover:border-stone-400 disabled:opacity-40 transition-colors"
                  >
                    {inboxSaving ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={loadInbox}
                    aria-label="Refresh"
                    className="text-sm text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                  >
                    ↻
                  </button>
                  <button
                    onClick={() => { setInboxEditValue(inboxContent ?? ''); setInboxEditing(true) }}
                    className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {inboxLoading ? (
              <p className="text-stone-400 dark:text-stone-500 text-sm animate-pulse">Loading…</p>
            ) : inboxEditing ? (
              <textarea
                value={inboxEditValue}
                onChange={(e) => setInboxEditValue(e.target.value)}
                className="w-full h-full resize-none bg-transparent text-sm text-stone-700 dark:text-stone-300 font-mono focus:outline-none leading-relaxed"
              />
            ) : inboxContent ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{inboxContent}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-stone-400 dark:text-stone-500 text-sm">Inbox is empty.</p>
            )}
          </div>
        </div>
      )}

      {/* To Do tab content */}
      {activeTab === 'todo' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-end px-4 py-2.5 border-b border-stone-100 dark:border-stone-800 gap-3 flex-shrink-0">
            {todoEditing ? (
              <>
                <button
                  onClick={() => setTodoEditing(false)}
                  className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTodo}
                  disabled={todoSaving}
                  className="text-xs font-medium text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 hover:border-stone-500 dark:hover:border-stone-400 disabled:opacity-40 transition-colors"
                >
                  {todoSaving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={loadTodo}
                  aria-label="Refresh"
                  className="text-sm text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                >
                  ↻
                </button>
                <button
                  onClick={() => { setTodoEditValue(todoContent ?? ''); setTodoEditing(true) }}
                  className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                >
                  Edit
                </button>
              </>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {todoLoading ? (
              <p className="text-stone-400 dark:text-stone-500 text-sm animate-pulse">Loading…</p>
            ) : todoEditing ? (
              <textarea
                value={todoEditValue}
                onChange={(e) => setTodoEditValue(e.target.value)}
                className="w-full h-full resize-none bg-transparent text-sm text-stone-700 dark:text-stone-300 font-mono focus:outline-none leading-relaxed"
              />
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

      {/* Tab bar */}
      <div
        className="flex border-t border-stone-100 dark:border-stone-800 flex-shrink-0"
        style={{ paddingBottom: kbHeight > 0 ? '0px' : 'env(safe-area-inset-bottom, 0px)' }}
      >
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-xs font-medium transition-colors select-none ${
              activeTab === tab
                ? 'text-stone-800 dark:text-stone-100'
                : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
    </div>
  )
}
