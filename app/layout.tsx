import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'ChatCDC - AI Assistant',
  description: 'A modern, luxurious AI chat interface powered by GPT-5',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sf">
        {children}
      </body>
    </html>
  )
}
