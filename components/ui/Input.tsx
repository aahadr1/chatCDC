'use client'

import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'ghost'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', variant = 'default', ...props }, ref) => {
    const variants = {
      default: 'bg-zinc-900 border border-zinc-800 focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700',
      ghost: 'bg-transparent border-none focus:ring-0',
    }
    
    return (
      <input
        ref={ref}
        className={`w-full rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all duration-200 ${variants[variant]} ${className}`}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: 'default' | 'ghost'
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', variant = 'default', ...props }, ref) => {
    const variants = {
      default: 'bg-zinc-900 border border-zinc-800 focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700',
      ghost: 'bg-transparent border-none focus:ring-0',
    }
    
    return (
      <textarea
        ref={ref}
        className={`w-full rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all duration-200 resize-none ${variants[variant]} ${className}`}
        {...props}
      />
    )
  }
)

Textarea.displayName = 'Textarea'

