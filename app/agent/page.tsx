'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Send,
  MessageCircle,
  FileText,
  Upload,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  ArrowLeft,
  Globe,
  Paperclip,
  X,
  Image as ImageIcon,
} from 'lucide-react'
import { MessageBubble } from '@/components/chat/MessageBubble'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from '@/components/chat/CodeBlock'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentMessageFile {
  id: string
  file_name: string
  file_url: string
  file_type: string
  preview?: string
}

interface AgentMessage {
  id: string
  content: string
  role: 'user' | 'assistant'
  created_at: string
  files?: AgentMessageFile[]
}

interface DocItem {
  id: string
  name: string
  file_type: string
  file_size: number
  chunk_count: number
  uploaded_at: string
}

interface AttachedFile {
  id: string
  file: File
  name: string
  type: string
  preview?: string
}

type SSEPayload =
  | { type: 'status'; phase: string; message?: string; section?: number; total?: number; title?: string }
  | { type: 'outline'; sections: { title: string; description?: string }[] }
  | { type: 'web_results'; results: { title: string; url: string }[] }
  | { type: 'content'; text: string }
  | { type: 'sources'; chunks: { doc: string; excerpt: string }[]; webUrls?: { title: string; url: string }[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgentPage() {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [forceDeep, setForceDeep] = useState(false)
  const [enableWebSearch, setEnableWebSearch] = useState(false)

  // Document base panel
  const [documents, setDocuments] = useState<DocItem[]>([])
  const [docPanelOpen, setDocPanelOpen] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)

  // Chat file attachments
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])

  // Streaming state
  const [statusPhase, setStatusPhase] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [outlineSections, setOutlineSections] = useState<{ title: string }[]>([])
  const [sectionProgress, setSectionProgress] = useState<{
    section: number
    total: number
    title: string
  } | null>(null)
  const [streamingContent, setStreamingContent] = useState('')
  const [sources, setSources] = useState<{ doc: string; excerpt: string }[]>([])
  const [webResults, setWebResults] = useState<{ title: string; url: string }[]>([])
  const [webSources, setWebSources] = useState<{ title: string; url: string }[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---------------------------------------------------------------------------
  // Document base management
  // ---------------------------------------------------------------------------

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

  const handleDocUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploadError(null)
    setUploading(true)
    setUploadProgress({ done: 0, total: files.length })

    const results = await Promise.allSettled(
      Array.from(files).map(async (file) => {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/agent/documents', { method: 'POST', body: form })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Échec : ${file.name}`)
        setUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : null))
        return data.document as DocItem
      })
    )

    const succeeded = results
      .filter((r): r is PromiseFulfilledResult<DocItem> => r.status === 'fulfilled')
      .map((r) => r.value)
    const failed = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => (r.reason as Error)?.message || 'Échec')

    if (succeeded.length > 0) setDocuments((prev) => [...succeeded, ...prev])
    if (failed.length > 0) setUploadError(`${failed.length} fichier(s) échoué(s) : ${failed.join(' | ')}`)

    setUploading(false)
    setUploadProgress(null)
    e.target.value = ''
  }, [])

  const handleDeleteDoc = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/agent/documents?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (res.ok) setDocuments((prev) => prev.filter((d) => d.id !== id))
    } catch (e) {
      console.warn('Delete failed', e)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Chat file attachments
  // ---------------------------------------------------------------------------

  const handleAttachFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return

    const newAttachments: AttachedFile[] = await Promise.all(
      files.map(async (file) => {
        let preview: string | undefined
        if (file.type.startsWith('image/')) {
          preview = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = (ev) => resolve(ev.target?.result as string)
            reader.onerror = () => resolve('')
            reader.readAsDataURL(file)
          })
        }
        return { id: crypto.randomUUID(), file, name: file.name, type: file.type, preview }
      })
    )
    setAttachedFiles((prev) => [...prev, ...newAttachments].slice(0, 10))
  }, [])

  const removeAttachedFile = useCallback((id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const handleSend = useCallback(async () => {
    const text = inputMessage.trim()
    if (!text || loading) return

    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      content: text,
      role: 'user',
      created_at: new Date().toISOString(),
      files:
        attachedFiles.length > 0
          ? attachedFiles.map((f) => ({ id: f.id, file_name: f.name, file_url: '', file_type: f.type, preview: f.preview }))
          : undefined,
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
    setWebResults([])
    setWebSources([])

    const filesToSend = [...attachedFiles]
    setAttachedFiles([])

    try {
      const formData = new FormData()
      formData.append('message', text)
      formData.append('forceDeep', String(forceDeep))
      formData.append('enableWebSearch', String(enableWebSearch))
      for (const af of filesToSend) {
        formData.append('files', af.file)
      }

      const res = await fetch('/api/agent/chat', { method: 'POST', body: formData })
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
              } else if (payload.type === 'web_results') {
                setWebResults(payload.results || [])
              } else if (payload.type === 'content') {
                fullContent += payload.text
                setStreamingContent(fullContent)
              } else if (payload.type === 'sources') {
                setSources(payload.chunks || [])
                if ('webUrls' in payload && payload.webUrls) {
                  setWebSources(payload.webUrls)
                }
              } else if (payload.type === 'error') {
                fullContent += `\n\n*Erreur : ${payload.message}*\n`
                setStreamingContent(fullContent)
              } else if (payload.type === 'done') {
                if (fullContent.trim()) {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      content: fullContent.trim(),
                      role: 'assistant',
                      created_at: new Date().toISOString(),
                    },
                  ])
                }
                setStreamingContent('')
                setStatusPhase(null)
                setStatusMessage('')
                setOutlineSections([])
                setSectionProgress(null)
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          content: `Désolé, une erreur s'est produite : ${err instanceof Error ? err.message : 'Erreur inconnue'}.`,
          role: 'assistant',
          created_at: new Date().toISOString(),
        },
      ])
      setStatusPhase(null)
      setStreamingContent('')
    } finally {
      setLoading(false)
    }
  }, [inputMessage, loading, forceDeep, enableWebSearch, attachedFiles])

  // ---------------------------------------------------------------------------
  // Drag & drop
  // ---------------------------------------------------------------------------

  const [isDragging, setIsDragging] = useState(false)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer.files.length > 0) handleAttachFiles(e.dataTransfer.files)
    },
    [handleAttachFiles]
  )

  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0)

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const phaseLabel = (phase: string | null) => {
    if (!phase) return ''
    const labels: Record<string, string> = {
      search: statusMessage || 'Recherche dans les documents...',
      web: statusMessage || 'Recherche sur le web...',
      plan: statusMessage || 'Élaboration du plan...',
      generate:
        sectionProgress
          ? `Section ${sectionProgress.section}/${sectionProgress.total} : ${sectionProgress.title}`
          : statusMessage || 'Génération...',
    }
    return labels[phase] || statusMessage || ''
  }

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div
      className="h-screen bg-zinc-950 flex flex-col overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-zinc-900/90 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="text-center">
              <Upload className="w-16 h-16 text-zinc-400 mx-auto mb-4" />
              <p className="text-xl text-zinc-300">Déposez vos fichiers ici</p>
              <p className="text-sm text-zinc-500 mt-1">PDF, DOCX, images, etc.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
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
            <BookOpen className="w-5 h-5 text-zinc-300" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Assistant Documents</h1>
            <p className="text-xs text-zinc-500">
              {documents.length > 0
                ? `${documents.length} document(s) · ${totalChunks} extraits`
                : 'Réponses basées sur vos documents'}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Document panel ────────────────────────────────────── */}
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
                    {uploading && uploadProgress
                      ? `Envoi ${uploadProgress.done}/${uploadProgress.total}...`
                      : 'Ajouter des documents'}
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt,.md,.csv,.json"
                      className="hidden"
                      onChange={handleDocUpload}
                      disabled={uploading}
                    />
                  </label>
                  {uploadError && <p className="text-xs text-red-400 mt-1">{uploadError}</p>}
                  <p className="text-xs text-zinc-500 mt-1">{totalChunks} extraits indexés</p>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin px-2 space-y-1">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-zinc-800/50 group">
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

        {/* ── Chat area ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="max-w-3xl mx-auto px-4 py-6">
              {/* Empty state */}
              {messages.length === 0 && !loading && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
                  <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-zinc-700">
                    <BookOpen className="w-8 h-8 text-zinc-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-zinc-100 mb-2">Posez votre question</h2>
                  <p className="text-zinc-500 max-w-md mx-auto mb-6">
                    Réponses basées sur vos documents. Joignez des fichiers, activez la recherche web, ou demandez un rapport complet.
                  </p>
                  {documents.length === 0 && (
                    <div className="max-w-lg mx-auto p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-left">
                      <p className="text-sm text-amber-200/90 font-medium mb-1">Aucun document dans la base</p>
                      <p className="text-xs text-zinc-400">
                        Ajoutez vos fichiers via le panneau <strong>« Base de documents »</strong> à gauche, ou activez
                        la <strong>recherche web</strong> pour commencer sans documents.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              <div className="space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id}>
                    {/* Show attached file names for user messages */}
                    {msg.role === 'user' && msg.files && msg.files.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2 justify-end">
                        {msg.files.map((f) => (
                          <span key={f.id} className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800 rounded-lg text-xs text-zinc-400">
                            {f.file_type.startsWith('image/') ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                            {f.file_name}
                          </span>
                        ))}
                      </div>
                    )}
                    <MessageBubble message={msg} onCopy={() => {}} isStreaming={false} />
                  </div>
                ))}

                {/* Streaming / thinking */}
                {loading && (
                  <div className="space-y-3">
                    {(statusPhase || streamingContent) && (
                      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-3">
                        {statusPhase && (
                          <div className="flex items-center gap-2 text-sm text-zinc-400">
                            {statusPhase === 'web' ? (
                              <Globe className="w-4 h-4 animate-pulse shrink-0 text-blue-400" />
                            ) : (
                              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            )}
                            <span>{phaseLabel(statusPhase)}</span>
                          </div>
                        )}

                        {/* Web results */}
                        {webResults.length > 0 && (
                          <div className="text-xs space-y-1">
                            <p className="text-zinc-500">Sources web trouvées :</p>
                            {webResults.slice(0, 5).map((r, i) => (
                              <a
                                key={i}
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 truncate"
                              >
                                <Globe className="w-3 h-3 shrink-0" />
                                {r.title}
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Outline */}
                        {outlineSections.length > 0 && (
                          <div className="text-xs">
                            <p className="text-zinc-500 mb-2">Plan :</p>
                            <ul className="list-disc list-inside text-zinc-400 space-y-1">
                              {outlineSections.map((s, i) => (
                                <li key={i} className={sectionProgress && i + 1 === sectionProgress.section ? 'text-zinc-200 font-medium' : ''}>
                                  {s.title}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Streaming content */}
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
                                  <CodeBlock
                                    code={String(children).replace(/\n$/, '')}
                                    language={className?.replace('language-', '').replace('lang-', '') || 'text'}
                                  />
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

          {/* ── Input area ──────────────────────────────────────── */}
          <div className="border-t border-zinc-800 bg-zinc-950 p-4">
            <div className="max-w-3xl mx-auto flex flex-col gap-2">
              {/* Toggles */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceDeep}
                    onChange={(e) => setForceDeep(e.target.checked)}
                    className="rounded border-zinc-600 bg-zinc-800 text-white focus:ring-zinc-500"
                  />
                  Mode rapport
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableWebSearch}
                    onChange={(e) => setEnableWebSearch(e.target.checked)}
                    className="rounded border-zinc-600 bg-zinc-800 text-white focus:ring-zinc-500"
                  />
                  <Globe className="w-3.5 h-3.5" />
                  Recherche web
                </label>
              </div>

              {/* Attached files preview */}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachedFiles.map((af) => (
                    <div
                      key={af.id}
                      className="relative flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300"
                    >
                      {af.preview ? (
                        <img src={af.preview} alt={af.name} className="w-8 h-8 rounded object-cover" />
                      ) : af.type.startsWith('image/') ? (
                        <ImageIcon className="w-4 h-4 text-zinc-500" />
                      ) : (
                        <FileText className="w-4 h-4 text-zinc-500" />
                      )}
                      <span className="max-w-[120px] truncate">{af.name}</span>
                      <button onClick={() => removeAttachedFile(af.id)} className="text-zinc-500 hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input bar */}
              <div className="flex items-end gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl focus-within:border-zinc-700 transition-colors">
                {/* Attach button */}
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept="image/*,.pdf,.docx,.txt,.md,.csv,.json"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleAttachFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                  title="Joindre des fichiers"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

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
                  onClick={handleSend}
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
