'use client'

import { useChat } from 'ai/react'
import { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import EngineCheck, { type Energy } from '@/components/EngineCheck'
import MessageCard from '@/components/MessageCard'

type Tab = 'chat' | 'next' | 'inbox' | 'todo'

const TAB_LABELS: Record<Tab, string> = {
  chat: 'Chat',
  next: 'Next',
  inbox: 'Inbox',
  todo: 'To Do',
}

function toggleCheckboxInContent(content: string, checkboxIndex: number, currentlyChecked: boolean): string {
  const lines = content.split('\n')
  let count = 0
  for (let i = 0; i < lines.length; i++) {
    if (/- \[[ xX]\]/.test(lines[i])) {
      if (count === checkboxIndex) {
        lines[i] = currentlyChecked
          ? lines[i].replace(/- \[[xX]\]/, '- [ ]')
          : lines[i].replace('- [ ]', '- [x]')
        break
      }
      count++
    }
  }
  return lines.join('\n')
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

  const chatState = useChat({ id: 'chat' })
  const nextState = useChat({ id: 'next' })

  const activeChat = activeTab === 'next' ? nextState : chatState

  // Auto-fire /next on first visit when Next tab has no history
  useEffect(() => {
    if (activeTab === 'next' && nextState.messages.length === 0 && !nextFired.current && !nextState.isLoading) {
      nextFired.current = true
      nextState.append(
        { role: 'user', content: '/next' },
        { body: { energy: energyRef.current, mode: 'next' } },
      )
    }
  }, [activeTab, nextState.messages.length, nextState.isLoading])

  // Load file tabs on first open
  useEffect(() => {
    if (activeTab === 'inbox' && inboxContent === null && !inboxLoading) loadInbox()
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'todo' && todoContent === null && !todoLoading) loadTodo()
  }, [activeTab])

  // Reset textarea height when switching tabs
  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [activeTab])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat.messages])

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
    const text = activeChat.input.trim()
    if (!text || activeChat.isLoading) return
    const mode = activeTabRef.current === 'next' ? 'next' : 'chat'
    activeChat.append(
      { role: 'user', content: text },
      { body: { energy: energyRef.current, mode } },
    )
    activeChat.setInput('')
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

  const handleInboxCheckbox = async (idx: number, checked: boolean) => {
    if (!inboxContent) return
    const newContent = toggleCheckboxInContent(inboxContent, idx, checked)
    setInboxContent(newContent)
    await saveFile('inbox', newContent)
  }

  const handleTodoCheckbox = async (idx: number, checked: boolean) => {
    if (!todoContent) return
    const newContent = toggleCheckboxInContent(todoContent, idx, checked)
    setTodoContent(newContent)
    await saveFile('todo', newContent)
  }

  const ingestInbox = () => {
    setActiveTab('chat')
    chatState.append(
      { role: 'user', content: '/triage' },
      { body: { energy: energyRef.current, mode: 'triage' } },
    )
  }

  const cleanUpAndArchive = () => {
    setActiveTab('chat')
    const today = new Date().toISOString().slice(0, 10)
    chatState.append(
      {
        role: 'user',
        content: `Archive the current To Do list and clean it up:
1. Read the \`created:\` date from frontmatter in the To Do content you have. Format it as M-DD-YY (e.g. 2026-06-18 → 6-18-26).
2. Write the full current To Do content to \`To Do/Archived/To Do Lists/To Do - [dated name].md\` using save_file_at_path.
3. Rewrite To Do.md using save_brain_file: keep all incomplete [ ] tasks in their sections, remove all completed [x] tasks, and set \`created: ${today}\` in the frontmatter.
4. Briefly confirm what was archived and what was removed.`,
      },
      { body: { energy: energyRef.current, mode: 'chat' } },
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
            {activeChat.messages.length === 0 && !activeChat.isLoading && (
              <div className="flex items-center justify-center h-full select-none">
                <p className="text-stone-400 dark:text-stone-500 text-sm">
                  {activeTab === 'next' ? 'Getting your next thing…' : "What's on your mind?"}
                </p>
              </div>
            )}
            {activeChat.messages.map((m) => (
              <MessageCard key={m.id} message={m} />
            ))}
            {activeChat.isLoading && activeChat.messages[activeChat.messages.length - 1]?.role === 'user' && (
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
                value={activeChat.input}
                placeholder="What's on your mind?"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2.5 text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600 transition-shadow"
                style={{ fontSize: '16px' }}
                onChange={(e) => { activeChat.setInput(e.target.value); resizeTextarea() }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
                }}
              />
              <button
                onClick={submit}
                disabled={activeChat.isLoading || !activeChat.input.trim()}
                aria-label="Send"
                className="rounded-xl bg-stone-800 dark:bg-stone-200 text-stone-50 dark:text-stone-900 w-10 h-10 flex items-center justify-center text-base font-medium disabled:opacity-25 hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors flex-shrink-0"
              >
                {activeChat.isLoading ? '·' : '↑'}
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
                  <button onClick={() => setInboxEditing(false)} className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">Cancel</button>
                  <button onClick={saveInbox} disabled={inboxSaving} className="text-xs font-medium text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 hover:border-stone-500 dark:hover:border-stone-400 disabled:opacity-40 transition-colors">
                    {inboxSaving ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <button onClick={loadInbox} aria-label="Refresh" className="text-sm text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">↻</button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {inboxLoading ? (
              <p className="px-4 py-4 text-stone-400 dark:text-stone-500 text-sm animate-pulse">Loading…</p>
            ) : inboxEditing ? (
              <textarea
                value={inboxEditValue}
                onChange={(e) => setInboxEditValue(e.target.value)}
                autoFocus
                className="w-full h-full resize-none bg-transparent px-4 py-4 text-stone-700 dark:text-stone-300 font-mono focus:outline-none leading-relaxed"
                style={{ fontSize: '16px' }}
              />
            ) : inboxContent ? (
              <div className="px-4 py-4 cursor-text" onClick={() => { setInboxEditValue(inboxContent); setInboxEditing(true) }}>
                {(() => {
                  let idx = 0
                  return (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          input(props) {
                            const { type, checked } = props
                            if (type !== 'checkbox') return <input {...props} />
                            const currentIdx = idx++
                            return (
                              <input
                                type="checkbox"
                                checked={!!checked}
                                onChange={() => {}}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleInboxCheckbox(currentIdx, !!checked)
                                }}
                                className="h-4 w-4 rounded border-stone-300 dark:border-stone-600 cursor-pointer"
                              />
                            )
                          },
                        }}
                      >
                        {inboxContent}
                      </ReactMarkdown>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <p className="px-4 py-4 text-stone-400 dark:text-stone-500 text-sm">Inbox is empty.</p>
            )}
          </div>
        </div>
      )}

      {/* To Do tab content */}
      {activeTab === 'todo' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100 dark:border-stone-800 gap-3 flex-shrink-0">
            <button
              onClick={cleanUpAndArchive}
              className="text-xs font-medium text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-1.5 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
            >
              Clean Up &amp; Archive
            </button>
            <div className="flex items-center gap-3">
              {todoEditing ? (
                <>
                  <button onClick={() => setTodoEditing(false)} className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">Cancel</button>
                  <button onClick={saveTodo} disabled={todoSaving} className="text-xs font-medium text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 hover:border-stone-500 dark:hover:border-stone-400 disabled:opacity-40 transition-colors">
                    {todoSaving ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <button onClick={loadTodo} aria-label="Refresh" className="text-sm text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">↻</button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {todoLoading ? (
              <p className="px-4 py-4 text-stone-400 dark:text-stone-500 text-sm animate-pulse">Loading…</p>
            ) : todoEditing ? (
              <textarea
                value={todoEditValue}
                onChange={(e) => setTodoEditValue(e.target.value)}
                autoFocus
                className="w-full h-full resize-none bg-transparent px-4 py-4 text-stone-700 dark:text-stone-300 font-mono focus:outline-none leading-relaxed"
                style={{ fontSize: '16px' }}
              />
            ) : todoContent ? (
              <div className="px-4 py-4 cursor-text" onClick={() => { setTodoEditValue(todoContent); setTodoEditing(true) }}>
                {(() => {
                  let idx = 0
                  return (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          input(props) {
                            const { type, checked } = props
                            if (type !== 'checkbox') return <input {...props} />
                            const currentIdx = idx++
                            return (
                              <input
                                type="checkbox"
                                checked={!!checked}
                                onChange={() => {}}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleTodoCheckbox(currentIdx, !!checked)
                                }}
                                className="h-4 w-4 rounded border-stone-300 dark:border-stone-600 cursor-pointer"
                              />
                            )
                          },
                        }}
                      >
                        {todoContent}
                      </ReactMarkdown>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <p className="px-4 py-4 text-stone-400 dark:text-stone-500 text-sm">Nothing here.</p>
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
