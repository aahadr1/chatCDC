'use client'

import { useState } from 'react'
import { Copy, Check, Play } from 'lucide-react'

interface CodeBlockProps {
  code: string
  language: string
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Basic syntax highlighting using regex
  const highlightCode = (code: string, lang: string) => {
    // Keywords for common languages
    const keywords: Record<string, string[]> = {
      javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'true', 'false', 'null', 'undefined'],
      typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'true', 'false', 'null', 'undefined', 'interface', 'type', 'enum', 'extends', 'implements'],
      python: ['def', 'class', 'return', 'if', 'else', 'elif', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'raise', 'with', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'lambda', 'async', 'await'],
      sql: ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AND', 'OR', 'NOT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'TABLE', 'INDEX', 'ALTER', 'DROP', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'DISTINCT', 'NULL', 'TRUE', 'FALSE'],
    }

    const langKeywords = keywords[lang] || keywords.javascript || []
    
    // Simple highlighting - in production you'd use a library like Prism or highlight.js
    let highlighted = code
      // Strings
      .replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '<span class="text-emerald-400">$&</span>')
      // Comments
      .replace(/(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm, '<span class="text-zinc-500">$&</span>')
      // Numbers
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="text-amber-400">$1</span>')
    
    // Keywords
    langKeywords.forEach(keyword => {
      const regex = new RegExp(`\\b(${keyword})\\b`, 'g')
      highlighted = highlighted.replace(regex, '<span class="text-purple-400">$1</span>')
    })

    return highlighted
  }

  return (
    <div className="code-block my-4 overflow-hidden">
      <div className="code-header">
        <span className="font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto p-4">
        <pre className="text-sm font-mono text-zinc-300">
          <code 
            dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }} 
          />
        </pre>
      </div>
    </div>
  )
}

