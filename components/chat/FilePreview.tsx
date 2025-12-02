'use client'

import { X, FileText, Image as ImageIcon, FileCode, FileSpreadsheet, File } from 'lucide-react'
import { motion } from 'framer-motion'

interface UploadedFile {
  id: string
  file_name: string
  file_url: string
  file_size: number
  file_type: string
  preview?: string
}

interface FilePreviewProps {
  files: UploadedFile[]
  onRemove: (id: string) => void
  isCompact?: boolean
}

export function FilePreview({ files, onRemove, isCompact = false }: FilePreviewProps) {
  if (files.length === 0) return null

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return ImageIcon
    if (type === 'application/pdf') return FileText
    if (type.includes('spreadsheet') || type.includes('csv')) return FileSpreadsheet
    if (type.includes('code') || type.includes('javascript') || type.includes('typescript')) return FileCode
    return File
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (isCompact) {
    return (
      <div className="flex flex-wrap gap-2">
        {files.map((file) => {
          const Icon = getFileIcon(file.file_type)
          const isImage = file.file_type.startsWith('image/')
          
          return (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="group relative"
            >
              {isImage && file.preview ? (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-zinc-700">
                  <img 
                    src={file.preview} 
                    alt={file.file_name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => onRemove(file.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-zinc-400" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg">
                  <Icon className="w-4 h-4 text-zinc-400" />
                  <span className="text-xs text-zinc-300 max-w-24 truncate">{file.file_name}</span>
                  <button
                    onClick={() => onRemove(file.id)}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-300">
          {files.length} file{files.length !== 1 ? 's' : ''} attached
        </span>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {files.map((file) => {
          const Icon = getFileIcon(file.file_type)
          const isImage = file.file_type.startsWith('image/')
          
          return (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="group relative bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden"
            >
              {isImage && file.preview ? (
                <div className="aspect-square">
                  <img 
                    src={file.preview} 
                    alt={file.file_name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-square flex flex-col items-center justify-center p-3">
                  <Icon className="w-8 h-8 text-zinc-500 mb-2" />
                  <span className="text-xs text-zinc-400 text-center truncate w-full">
                    {file.file_name}
                  </span>
                </div>
              )}
              
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <p className="text-xs text-zinc-300 truncate">{file.file_name}</p>
                <p className="text-2xs text-zinc-500">{formatFileSize(file.file_size)}</p>
              </div>
              
              <button
                onClick={() => onRemove(file.id)}
                className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

