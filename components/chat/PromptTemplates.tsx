'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Code, FileText, Languages, Search, Brain, PenTool, Zap, X, Plus } from 'lucide-react'

interface PromptTemplate {
  id: string
  name: string
  icon: React.ElementType
  prompt: string
  description: string
}

const defaultTemplates: PromptTemplate[] = [
  {
    id: 'summarize',
    name: 'Summarize',
    icon: FileText,
    prompt: 'Please summarize the following text concisely, highlighting the key points:\n\n',
    description: 'Get a quick summary of any text',
  },
  {
    id: 'explain',
    name: 'Explain',
    icon: Brain,
    prompt: 'Please explain the following concept in simple terms that a beginner could understand:\n\n',
    description: 'Simplify complex topics',
  },
  {
    id: 'code-review',
    name: 'Code Review',
    icon: Code,
    prompt: 'Please review the following code for bugs, performance issues, and best practices. Suggest improvements:\n\n```\n',
    description: 'Get feedback on your code',
  },
  {
    id: 'translate',
    name: 'Translate',
    icon: Languages,
    prompt: 'Please translate the following text to [TARGET_LANGUAGE]:\n\n',
    description: 'Translate text to any language',
  },
  {
    id: 'improve-writing',
    name: 'Improve Writing',
    icon: PenTool,
    prompt: 'Please improve the following text for clarity, grammar, and style while maintaining its original meaning:\n\n',
    description: 'Polish your writing',
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    icon: Sparkles,
    prompt: 'Please help me brainstorm ideas for the following topic. Generate creative and diverse suggestions:\n\n',
    description: 'Generate creative ideas',
  },
]

interface PromptTemplatesProps {
  onSelect: (prompt: string) => void
  isOpen: boolean
  onClose: () => void
}

export function PromptTemplates({ onSelect, isOpen, onClose }: PromptTemplatesProps) {
  const [search, setSearch] = useState('')
  
  const filteredTemplates = defaultTemplates.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="absolute bottom-full left-0 right-0 mb-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden max-h-96"
        >
          <div className="p-3 border-b border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-zinc-200">Quick Prompts</h3>
              <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
          </div>
          
          <div className="p-2 overflow-y-auto max-h-64 scrollbar-thin">
            <div className="grid grid-cols-2 gap-2">
              {filteredTemplates.map((template) => {
                const Icon = template.icon
                return (
                  <button
                    key={template.id}
                    onClick={() => {
                      onSelect(template.prompt)
                      onClose()
                    }}
                    className="flex items-start gap-3 p-3 text-left rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{template.name}</p>
                      <p className="text-xs text-zinc-500 truncate">{template.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Slash command handler
export function parseSlashCommand(input: string): { command: string; args: string } | null {
  const match = input.match(/^\/(\w+)\s*(.*)$/)
  if (!match) return null
  
  return {
    command: match[1].toLowerCase(),
    args: match[2],
  }
}

export function getPromptFromCommand(command: string): string | null {
  const commandMap: Record<string, string> = {
    summarize: defaultTemplates.find(t => t.id === 'summarize')?.prompt || '',
    explain: defaultTemplates.find(t => t.id === 'explain')?.prompt || '',
    code: defaultTemplates.find(t => t.id === 'code-review')?.prompt || '',
    review: defaultTemplates.find(t => t.id === 'code-review')?.prompt || '',
    translate: defaultTemplates.find(t => t.id === 'translate')?.prompt || '',
    improve: defaultTemplates.find(t => t.id === 'improve-writing')?.prompt || '',
    brainstorm: defaultTemplates.find(t => t.id === 'brainstorm')?.prompt || '',
  }
  
  return commandMap[command] || null
}

