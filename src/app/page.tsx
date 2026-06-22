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
    if (/^\s*(?:-|\d+\.)\s+\[[ xX]\]/.test(lines[i])) {
      if (count === checkboxIndex) {
        lines[i] = currentlyChecked
          ? lines[i].replace(/\[[xX]\]/, '[ ]')
          : lines[i].replace('[ ]', '[x]')
        break
      }
      count++
    }
  }
  return lines.join('\n')
}

function compressImage(file: File, maxWidth = 1200, quality = 0.72): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', quality)
    }
    img.onerror = reject
    img.src = url
  })
}

// Convert Obsidian wikilink syntax to standard markdown that ReactMarkdown understands.
// ![[Photos/x.jpg]] → standard img tag via the vault-image proxy
// [[Note Name]]      → obsidian:// deep link that opens the note in the app
function processObsidianLinks(content: string): string {
  // Images first so the wikilink pass doesn't double-process them
  let out = content.replace(
    /!\[\[([^\]]+\.(?:jpg|jpeg|png|gif|webp))\]\]/gi,
    (_, p) => `![](/api/vault-image?path=${encodeURIComponent(p)})`
  )
  // [[Note|Alias]] and [[Note]] — negative lookbehind skips ![[...]] that remain
  out = out.replace(/(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, note, alias) => {
    const display = (alias ?? note).trim()
    const url = `obsidian://open?file=${encodeURIComponent(note.trim())}`
    return `[${display}](${url})`
  })
  return out
}

function ThinkingDots() {
  return (
    <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 px-5 py-4 shadow-sm">
      <div className="flex gap-1.5 items-center h-4">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-stone-300 dark:bg-stone-600 animate-bounce"
            style={{ animationDelay: `${i * 160}ms`, animationDuration: '0.9s' }}
          />
        ))}
      </div>
    </div>
  )
}

const mdComponents = (onCheckbox: (idx: number, checked: boolean) => void) => {
  let idx = 0
  return {
    input(props: React.InputHTMLAttributes<HTMLInputElement>) {
      const { type, checked } = props
      if (type !== 'checkbox') return <input {...props} />
      const currentIdx = idx++
      return (
        <input
          type="checkbox"
          checked={!!checked}
          onChange={() => {}}
          onClick={(e) => { e.stopPropagation(); onCheckbox(currentIdx, !!checked) }}
          className="h-4 w-4 rounded border-stone-300 dark:border-stone-600 cursor-pointer"
        />
      )
    },
    img({ src, alt }: { src?: string; alt?: string }) {
      if (!src) return null
      return (
        <img
          src={src}
          alt={alt ?? ''}
          className="rounded-xl my-2 object-contain max-h-48"
          style={{ maxWidth: '100%' }}
        />
      )
    },
    a({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
      const isHttp = href?.startsWith('http')
      return (
        <a
          href={href}
          target={isHttp ? '_blank' : '_self'}
          rel={isHttp ? 'noopener noreferrer' : undefined}
          className="text-stone-600 dark:text-stone-400 underline underline-offset-2"
        >
          {children}
        </a>
      )
    },
  }
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

  // Mic / transcription
  const [isRecording, setIsRecording] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const isRecordingRef = useRef(false)
  const finalTextRef = useRef('')
  const recognitionRef = useRef<any>(null)

  // Audio visualisation
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)

  // Photo upload
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

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

  // Waveform draw loop
  useEffect(() => {
    if (!isRecording || !analyserRef.current) return
    let frameId: number
    const draw = () => {
      const analyser = analyserRef.current
      const canvas = canvasRef.current
      if (!analyser || !canvas) { frameId = requestAnimationFrame(draw); return }
      const dpr = window.devicePixelRatio || 1
      const cw = canvas.clientWidth * dpr
      const ch = canvas.clientHeight * dpr
      if (canvas.width !== cw) canvas.width = cw
      if (canvas.height !== ch) canvas.height = ch
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, cw, ch)
      const buf = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(buf)
      const bars = 32
      const bw = Math.max(2, Math.floor(cw / bars * 0.45))
      const spacing = (cw - bars * bw) / (bars + 1)
      for (let i = 0; i < bars; i++) {
        const v = buf[Math.floor(i * analyser.frequencyBinCount / bars)] / 255
        const bh = Math.max(3 * dpr, v * ch * 0.92)
        const x = spacing + i * (bw + spacing)
        const y = (ch - bh) / 2
        ctx.fillStyle = `rgba(239,68,68,${0.35 + v * 0.65})`
        ctx.fillRect(x, y, bw, bh)
      }
      frameId = requestAnimationFrame(draw)
    }
    frameId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameId)
  }, [isRecording])

  useEffect(() => {
    if (activeTab === 'next' && nextState.messages.length === 0 && !nextFired.current && !nextState.isLoading) {
      nextFired.current = true
      nextState.append({ role: 'user', content: '/next' }, { body: { energy: energyRef.current, mode: 'next' } })
    }
  }, [activeTab, nextState.messages.length, nextState.isLoading])

  useEffect(() => {
    if (activeTab === 'inbox' && inboxContent === null && !inboxLoading) loadInbox()
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'todo' && todoContent === null && !todoLoading) loadTodo()
  }, [activeTab])

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [activeTab])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat.messages])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      if (containerRef.current) containerRef.current.style.height = `${vv.height}px`
      if (vv.offsetTop > 0) requestAnimationFrame(() => window.scrollTo(0, 0))
      const kb = Math.max(0, window.innerHeight - vv.height)
      setKbHeight(kb)
      if (kb > 0) setTimeout(() => { if (mainRef.current) mainRef.current.scrollTop = mainRef.current.scrollHeight }, 50)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
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
    activeChat.append({ role: 'user', content: text }, { body: { energy: energyRef.current, mode } })
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

  const startRecording = async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    finalTextRef.current = ''
    setLiveTranscript('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      audioStreamRef.current = stream
      const audioCtx = new AudioContext()
      audioContextRef.current = audioCtx
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      audioCtx.createMediaStreamSource(stream).connect(analyser)
    } catch {}
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTextRef.current += e.results[i][0].transcript + ' '
        else interim = e.results[i][0].transcript
      }
      setLiveTranscript(finalTextRef.current + interim)
    }
    recognition.onend = () => { if (isRecordingRef.current) try { recognition.start() } catch {} }
    recognition.onerror = (e: any) => {
      if (e.error !== 'aborted') { isRecordingRef.current = false; setIsRecording(false) }
    }
    recognition.start()
    recognitionRef.current = recognition
    isRecordingRef.current = true
    setIsRecording(true)
  }

  const stopRecording = () => {
    isRecordingRef.current = false
    setIsRecording(false)
    recognitionRef.current?.stop()
    recognitionRef.current = null
    audioStreamRef.current?.getTracks().forEach(t => t.stop())
    audioContextRef.current?.close()
    audioStreamRef.current = null
    audioContextRef.current = null
    analyserRef.current = null
    const text = finalTextRef.current.trim()
    if (text) {
      setInboxContent(prev => {
        const base = (prev ?? '').trimEnd()
        const next = base ? base + '\n- ' + text : '- ' + text
        saveFile('inbox', next)
        return next
      })
    }
    setLiveTranscript('')
    finalTextRef.current = ''
  }

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setPhotoUploading(true)
    try {
      const compressed = await compressImage(file)
      const fd = new FormData()
      fd.append('file', compressed, file.name.replace(/\.[^.]+$/, '.jpg'))
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.obsidianLink) {
        setInboxContent(prev => {
          const base = (prev ?? '').trimEnd()
          const next = base ? base + '\n' + data.obsidianLink : data.obsidianLink
          saveFile('inbox', next)
          return next
        })
      }
    } finally {
      setPhotoUploading(false)
    }
  }

  const ingestInbox = () => {
    setActiveTab('chat')
    chatState.append({ role: 'user', content: '/triage' }, { body: { energy: energyRef.current, mode: 'triage' } })
  }

  const cleanUpAndArchive = () => {
    setActiveTab('chat')
    const today = new Date().toISOString().slice(0, 10)
    chatState.append(
      { role: 'user', content: `Archive the current To Do list and clean it up:\n1. Read the \`created:\` date from frontmatter in the To Do content you have. Format it as M-DD-YY (e.g. 2026-06-18 → 6-18-26).\n2. Write the full current To Do content to \`To Do/Archived/To Do Lists/To Do - [dated name].md\` using save_file_at_path.\n3. Rewrite To Do.md using save_brain_file: keep all incomplete [ ] tasks in their sections, remove all completed [x] tasks, and set \`created: ${today}\` in the frontmatter.\n4. Briefly confirm what was archived and what was removed.` },
      { body: { energy: energyRef.current, mode: 'chat' } },
    )
  }

  const isChatTab = activeTab === 'chat' || activeTab === 'next'

  return (
    <div ref={containerRef} className="fixed top-0 inset-x-0 flex flex-col max-w-lg mx-auto" style={{ height: '100svh' }}>

      <header className="flex items-center justify-between px-4 pt-safe border-b border-stone-100 dark:border-stone-800 py-3 flex-shrink-0">
        <span className="text-stone-600 dark:text-stone-400 font-medium tracking-tight select-none">tasks</span>
        <EngineCheck energy={energy} onChange={setEnergy} />
      </header>

      {/* ── Chat / Next ── */}
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
            {activeChat.messages.map((m) => <MessageCard key={m.id} message={m} />)}
            {activeChat.isLoading && activeChat.messages[activeChat.messages.length - 1]?.role === 'user' && (
              <ThinkingDots />
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
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
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

      {/* ── Inbox ── */}
      {activeTab === 'inbox' && (
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Toolbar */}
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
                <>
                  <button
                    onClick={() => { setInboxEditValue(inboxContent ?? ''); setInboxEditing(true) }}
                    className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                  >
                    Edit
                  </button>
                  <button onClick={loadInbox} aria-label="Refresh" className="text-sm text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">↻</button>
                </>
              )}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            <div className={!inboxEditing ? 'pb-32' : ''}>
              {inboxLoading ? (
                <p className="px-4 py-4 text-stone-400 dark:text-stone-500 text-sm animate-pulse">Loading…</p>
              ) : inboxEditing ? (
                <textarea
                  value={inboxEditValue}
                  onChange={(e) => setInboxEditValue(e.target.value)}
                  autoFocus
                  className="w-full resize-none bg-transparent px-4 py-4 text-stone-700 dark:text-stone-300 font-mono focus:outline-none leading-relaxed"
                  style={{ fontSize: '16px', minHeight: '100%' }}
                />
              ) : inboxContent ? (
                <div className="px-4 py-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={mdComponents(handleInboxCheckbox) as any}
                    >
                      {processObsidianLinks(inboxContent)}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                <p className="px-4 py-4 text-stone-400 dark:text-stone-500 text-sm">Inbox is empty.</p>
              )}
            </div>
          </div>

          {/* ── Floating mic + photo ── */}
          {!inboxEditing && (
            <div className="absolute bottom-0 inset-x-0 flex flex-col items-center pb-4 pointer-events-none z-10">
              {/* Live transcript card */}
              {isRecording && (
                <div className="pointer-events-auto mb-3 mx-6 max-w-xs w-full bg-stone-900/95 dark:bg-stone-950/95 backdrop-blur-md rounded-2xl px-4 py-3 shadow-2xl">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-red-400 mb-1.5">Listening</p>
                  <p className="text-sm text-white leading-relaxed min-h-[1.25rem]">
                    {liveTranscript || <span className="text-stone-500 italic">Start speaking…</span>}
                  </p>
                </div>
              )}

              {/* Waveform canvas */}
              {isRecording && (
                <div className="w-52 h-10 mb-2">
                  <canvas ref={canvasRef} className="w-full h-full" />
                </div>
              )}

              {/* Buttons row: photo + mic side by side */}
              <div className="flex items-center gap-5 pointer-events-auto">
                {/* Photo button */}
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                  aria-label="Add photo"
                  className="w-14 h-14 rounded-full bg-stone-800 dark:bg-stone-700 flex items-center justify-center shadow-xl hover:bg-stone-700 dark:hover:bg-stone-600 disabled:opacity-40 transition-colors"
                >
                  {photoUploading ? (
                    <span className="text-white text-xs animate-pulse">…</span>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  )}
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />

                {/* Mic button */}
                <div className="relative">
                  {isRecording && (
                    <div className="absolute inset-0 rounded-full bg-red-500/40 animate-ping" />
                  )}
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    aria-label={isRecording ? 'Stop recording' : 'Start voice note'}
                    className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 ${
                      isRecording
                        ? 'bg-red-500 scale-110'
                        : 'bg-stone-800 dark:bg-stone-700 hover:bg-stone-700 dark:hover:bg-stone-600'
                    }`}
                  >
                    {isRecording ? (
                      <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <rect x="9" y="2" width="6" height="11" rx="3" />
                        <path d="M5 10a7 7 0 0 0 14 0" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                        <line x1="8" y1="22" x2="16" y2="22" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {isRecording && (
                <p className="text-[11px] text-red-400 mt-1.5 font-medium pointer-events-none">Tap to save &amp; stop</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── To Do ── */}
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
                <>
                  <button onClick={() => { setTodoEditValue(todoContent ?? ''); setTodoEditing(true) }} className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">Edit</button>
                  <button onClick={loadTodo} aria-label="Refresh" className="text-sm text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">↻</button>
                </>
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
              <div className="px-4 py-4">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={mdComponents(handleTodoCheckbox) as any}
                  >
                    {processObsidianLinks(todoContent)}
                  </ReactMarkdown>
                </div>
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
