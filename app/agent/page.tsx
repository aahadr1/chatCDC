'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Landmark,
  Send,
  MessageCircle,
  FileText,
  Upload,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import { MessageBubble } from '@/components/chat/MessageBubble'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from '@/components/chat/CodeBlock'

interface AgentMessage {
  id: string
  content: string
  role: 'user' | 'assistant'
  created_at: string
}

interface DocItem {
  id: string
  name: string
  file_type: string
  file_size: number
  chunk_count: number
  uploaded_at: string
}

type SSEPayload =
  | { type: 'status'; phase: string; message?: string; section?: number; total?: number; title?: string }
  | { type: 'outline'; sections: { title: string; description?: string; search_queries?: string[] }[] }
  | { type: 'content'; text: string }
  | { type: 'sources'; chunks: { doc: string; excerpt: string }[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

export default function AgentPage() {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [forceDeep, setForceDeep] = useState(false)
  const [documents, setDocuments] = useState<DocItem[]>([])
  const [docPanelOpen, setDocPanelOpen] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [statusPhase, setStatusPhase] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [outlineSections, setOutlineSections] = useState<{ title: string }[]>([])
  const [sectionProgress, setSectionProgress] = useState<{ section: number; total: number; title: string } | null>(null)
  const [streamingContent, setStreamingContent] = useState('')
  const [sources, setSources] = useState<{ doc: string; excerpt: string }[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/documents')
      if (res.ok) {
        const { documents: docs } = await res.json()
        setDocuments(docs || [])
      }
    } catch (e) {
      console.warn('Failed to load documents', e)
    }
  }, [])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, sectionProgress, outlineSections])

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploadError(null)
      setUploading(true)
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/agent/documents', { method: 'POST', body: form })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        setDocuments((prev) => [data.document, ...prev])
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
        e.target.value = ''
      }
    },
    []
  )

  const handleDeleteDoc = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/agent/documents?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (res.ok) setDocuments((prev) => prev.filter((d) => d.id !== id))
    } catch (e) {
      console.warn('Delete failed', e)
    }
  }, [])

  const handleSend = useCallback(async () => {
    const text = inputMessage.trim()
    if (!text || loading) return

    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      content: text,
      role: 'user',
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInputMessage('')
    setLoading(true)
    setStatusPhase('search')
    setStatusMessage('Recherche dans les documents...')
    setOutlineSections([])
    setSectionProgress(null)
    setStreamingContent('')
    setSources([])

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, forceDeep }),
      })
      if (!res.ok) throw new Error('Request failed')
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const payload = JSON.parse(line.slice(6)) as SSEPayload
              if (payload.type === 'status') {
                setStatusPhase(payload.phase)
                setStatusMessage(payload.message || '')
                if (payload.section != null && payload.total != null && payload.title) {
                  setSectionProgress({ section: payload.section, total: payload.total, title: payload.title })
                }
              } else if (payload.type === 'outline') {
                setOutlineSections(payload.sections || [])
                setStatusPhase('plan')
                setStatusMessage('Plan généré.')
              } else if (payload.type === 'content') {
                fullContent += payload.text
                setStreamingContent(fullContent)
              } else if (payload.type === 'sources') {
                setSources(payload.chunks || [])
              } else if (payload.type === 'error') {
                fullContent += `\n\n*Erreur: ${payload.message}*\n`
                setStreamingContent((prev) => prev + `\n\n*Erreur: ${payload.message}*`)
              } else if (payload.type === 'done') {
                if (fullContent.trim()) {
                  const assistantMsg: AgentMessage = {
                    id: crypto.randomUUID(),
                    content: fullContent.trim(),
                    role: 'assistant',
                    created_at: new Date().toISOString(),
                  }
                  setMessages((prev) => [...prev, assistantMsg])
                }
                setStreamingContent('')
                setStatusPhase(null)
                setStatusMessage('')
                setOutlineSections([])
                setSectionProgress(null)
              }
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          content: `Désolé, une erreur s'est produite: ${err instanceof Error ? err.message : 'Erreur inconnue'}.`,
          role: 'assistant',
          created_at: new Date().toISOString(),
        },
      ])
      setStatusPhase(null)
      setStreamingContent('')
    } finally {
      setLoading(false)
    }
  }, [inputMessage, loading, forceDeep])

  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0)

  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/chat"
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Retour au chat"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-10 h-10 bg-zinc-800 border border-zinc-700 rounded-xl flex items-center justify-center">
            <Landmark className="w-5 h-5 text-zinc-300" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">CDC Agent</h1>
            <p className="text-xs text-zinc-500">Réponses basées sur la base de documents</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Document panel */}
        <div className="w-72 border-r border-zinc-800 bg-zinc-900/50 flex flex-col shrink-0">
          <button
            onClick={() => setDocPanelOpen((o) => !o)}
            className="flex items-center justify-between w-full px-4 py-3 text-left text-sm font-medium text-zinc-300 hover:bg-zinc-800/50"
          >
            <span className="flex items-center gap-2">
              {docPanelOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Base de documents
            </span>
            <span className="text-zinc-500 text-xs">{documents.length} doc.</span>
          </button>
          <AnimatePresence>
            {docPanelOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex flex-col overflow-hidden"
              >
                <div className="px-3 pb-2">
                  <label className="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer hover:bg-zinc-700 transition-colors text-sm text-zinc-300">
                    <Upload className="w-4 h-4" />
                    {uploading ? 'Envoi...' : 'Ajouter un document'}
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt,.md,.csv,.json"
                      className="hidden"
                      onChange={handleUpload}
                      disabled={uploading}
                    />
                  </label>
                  {uploadError && <p className="text-xs text-red-400 mt-1">{uploadError}</p>}
                  <p className="text-xs text-zinc-500 mt-1">{totalChunks} extraits indexés</p>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin px-2 space-y-1">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-zinc-800/50 group"
                    >
                      <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                      <span className="flex-1 text-xs text-zinc-300 truncate" title={doc.name}>
                        {doc.name}
                      </span>
                      <span className="text-xs text-zinc-500">{doc.chunk_count}</span>
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="max-w-3xl mx-auto px-4 py-6">
              {messages.length === 0 && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-20"
                >
                  <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-zinc-700">
                    <Landmark className="w-8 h-8 text-zinc-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-zinc-100 mb-2">Posez votre question</h2>
                  <p className="text-zinc-500 max-w-md mx-auto mb-6">
                    L&apos;agent répond en s&apos;appuyant sur les documents de la base. Questions courtes ou demandes de rapport long.
                  </p>
                  {documents.length === 0 && (
                    <div className="max-w-lg mx-auto p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-left">
                      <p className="text-sm text-amber-200/90 font-medium mb-1">Aucun document dans la base</p>
                      <p className="text-xs text-zinc-400">
                        Ajoutez d&apos;abord des PDF, DOCX ou TXT via le panneau <strong>« Base de documents »</strong> à gauche (bouton « Ajouter un document »). L&apos;agent ne utilise pas les fichiers envoyés dans le chat principal — uniquement ceux ajoutés ici.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              <div className="space-y-6">
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    onCopy={() => {}}
                    isStreaming={false}
                  />
                ))}

                {/* Thinking steps */}
                {loading && (
                  <div className="space-y-3">
                    {(statusPhase || streamingContent) && (
                      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-3">
                        {statusPhase && (
                          <div className="flex items-center gap-2 text-sm text-zinc-400">
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            <span>
                              {statusPhase === 'search' && (statusMessage || 'Recherche dans les documents...')}
                              {statusPhase === 'plan' && (statusMessage || 'Élaboration du plan...')}
                              {statusPhase === 'generate' && sectionProgress &&
                                `Section ${sectionProgress.section}/${sectionProgress.total}: ${sectionProgress.title}`}
                            </span>
                          </div>
                        )}
                        {outlineSections.length > 0 && (
                          <div className="text-xs">
                            <p className="text-zinc-500 mb-2">Plan:</p>
                            <ul className="list-disc list-inside text-zinc-400 space-y-1">
                              {outlineSections.map((s, i) => (
                                <li key={i}>{s.title}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    {streamingContent && (
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                          <MessageCircle className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div className="flex-1 message-assistant px-4 py-3 rounded-xl border border-zinc-800 prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code: (props: { node?: unknown; inline?: boolean; className?: string; children?: React.ReactNode }) => {
                                const { inline, className, children } = props
                                return inline ? (
                                  <code className={className}>{children}</code>
                                ) : (
                                  <CodeBlock code={String(children).replace(/\n$/, '')} language={(className?.replace('language-', '').replace('lang-', '') || 'text')} />
                                )
                              },
                            }}
                          >
                            {streamingContent}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800 bg-zinc-950 p-4">
            <div className="max-w-3xl mx-auto flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceDeep}
                  onChange={(e) => setForceDeep(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-800 text-white focus:ring-zinc-500"
                />
                Mode rapport long (analyse multi-documents, plan puis sections)
              </label>
              <div className="flex gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl">
                <textarea
                  ref={inputRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Posez votre question ou demandez un rapport..."
                  rows={2}
                  className="flex-1 bg-transparent text-zinc-100 placeholder:text-zinc-500 focus:outline-none resize-none min-h-[40px]"
                />
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={loading || !inputMessage.trim()}
                  className="p-2 rounded-lg bg-white text-zinc-900 hover:bg-zinc-200 transition-colors disabled:opacity-50 shrink-0"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
