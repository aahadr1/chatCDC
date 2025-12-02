'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, X, Sliders, Brain, MessageSquare, Globe, Zap, Languages, ChevronDown } from 'lucide-react'

// Available languages
export const LANGUAGES = [
  { code: 'auto', name: 'Auto-detect', flag: '🌐' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'sv', name: 'Svenska', flag: '🇸🇪' },
  { code: 'da', name: 'Dansk', flag: '🇩🇰' },
  { code: 'fi', name: 'Suomi', flag: '🇫🇮' },
  { code: 'no', name: 'Norsk', flag: '🇳🇴' },
  { code: 'cs', name: 'Čeština', flag: '🇨🇿' },
  { code: 'el', name: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'he', name: 'עברית', flag: '🇮🇱' },
  { code: 'ro', name: 'Română', flag: '🇷🇴' },
  { code: 'hu', name: 'Magyar', flag: '🇭🇺' },
  { code: 'bg', name: 'Български', flag: '🇧🇬' },
]

export interface ChatSettings {
  verbosity: 'low' | 'medium' | 'high'
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  enableWebSearch: boolean
  maxTokens: number
  language: string
}

interface SettingsPanelProps {
  settings: ChatSettings
  onSettingsChange: (settings: ChatSettings) => void
  isOpen: boolean
  onClose: () => void
}

export function SettingsPanel({ settings, onSettingsChange, isOpen, onClose }: SettingsPanelProps) {
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false)
  
  const updateSetting = <K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value })
  }

  const selectedLanguage = LANGUAGES.find(l => l.code === settings.language) || LANGUAGES[0]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-80 bg-zinc-900 border-l border-zinc-800 z-50 overflow-y-auto"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-zinc-400" />
                <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="p-4 space-y-6">
              {/* Language Selection */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Languages className="w-4 h-4 text-zinc-500" />
                  <label className="text-sm font-medium text-zinc-300">Response Language</label>
                </div>
                <div className="relative">
                  <button
                    onClick={() => setLanguageDropdownOpen(!languageDropdownOpen)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-left hover:border-zinc-600 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{selectedLanguage.flag}</span>
                      <span className="text-zinc-200">{selectedLanguage.name}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${languageDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  <AnimatePresence>
                    {languageDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-10 mt-2 w-full bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl max-h-64 overflow-y-auto scrollbar-thin"
                      >
                        {LANGUAGES.map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => {
                              updateSetting('language', lang.code)
                              setLanguageDropdownOpen(false)
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-700 transition-colors ${
                              settings.language === lang.code ? 'bg-zinc-700' : ''
                            }`}
                          >
                            <span className="text-lg">{lang.flag}</span>
                            <span className={settings.language === lang.code ? 'text-white' : 'text-zinc-300'}>
                              {lang.name}
                            </span>
                            {settings.language === lang.code && (
                              <span className="ml-auto text-white">✓</span>
                            )}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  {settings.language === 'auto' 
                    ? 'AI will respond in the same language you use'
                    : `AI will always respond in ${selectedLanguage.name}`
                  }
                </p>
              </div>

              {/* Verbosity */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-zinc-500" />
                  <label className="text-sm font-medium text-zinc-300">Response Length</label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => updateSetting('verbosity', level)}
                      className={`px-3 py-2 text-sm rounded-lg transition-colors capitalize ${
                        settings.verbosity === level
                          ? 'bg-white text-zinc-900'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  {settings.verbosity === 'low' && 'Brief, concise responses'}
                  {settings.verbosity === 'medium' && 'Balanced detail and brevity'}
                  {settings.verbosity === 'high' && 'Detailed, comprehensive responses'}
                </p>
              </div>

              {/* Reasoning Effort */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4 text-zinc-500" />
                  <label className="text-sm font-medium text-zinc-300">Reasoning Depth</label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['minimal', 'low', 'medium', 'high'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => updateSetting('reasoningEffort', level)}
                      className={`px-3 py-2 text-sm rounded-lg transition-colors capitalize ${
                        settings.reasoningEffort === level
                          ? 'bg-white text-zinc-900'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  Higher reasoning = more thoughtful but slower responses
                </p>
              </div>

              {/* Web Search Toggle */}
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-zinc-500" />
                    <label className="text-sm font-medium text-zinc-300">Web Search</label>
                  </div>
                  <button
                    onClick={() => updateSetting('enableWebSearch', !settings.enableWebSearch)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      settings.enableWebSearch ? 'bg-white' : 'bg-zinc-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                        settings.enableWebSearch 
                          ? 'left-6 bg-zinc-900' 
                          : 'left-1 bg-zinc-400'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  Enable real-time web search for up-to-date information
                </p>
              </div>

              {/* Max Tokens */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-zinc-500" />
                  <label className="text-sm font-medium text-zinc-300">Max Response Length</label>
                </div>
                <input
                  type="range"
                  min={500}
                  max={8000}
                  step={500}
                  value={settings.maxTokens}
                  onChange={(e) => updateSetting('maxTokens', parseInt(e.target.value))}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white"
                />
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>500</span>
                  <span className="text-zinc-300">{settings.maxTokens} tokens</span>
                  <span>8000</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
