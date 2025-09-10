'use client';

import React from 'react';
import { ChatSettings } from '@/types/chat';
import { ChevronDown, Zap, Globe, Brain, MessageSquare } from 'lucide-react';

interface HeaderProps {
  settings: ChatSettings;
  onSettingsChange: (settings: ChatSettings) => void;
  currentTitle?: string;
}

export default function Header({ settings, onSettingsChange, currentTitle }: HeaderProps) {
  const [showModelDropdown, setShowModelDropdown] = React.useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = React.useState(false);

  const models = [
    { id: 'gpt-5', name: 'GPT-5', description: 'Most capable model' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Fast and efficient' },
    { id: 'gpt-5-nano', name: 'GPT-5 Nano', description: 'Ultra-fast responses' },
  ] as const;

  const verbosityLevels = [
    { id: 'minimal', name: 'Concise', description: 'Short and direct' },
    { id: 'medium', name: 'Balanced', description: 'Moderate detail' },
    { id: 'verbose', name: 'Detailed', description: 'Comprehensive responses' },
  ] as const;

  const reasoningLevels = [
    { id: 'minimal', name: 'Minimal', description: 'Quick responses' },
    { id: 'medium', name: 'Medium', description: 'Moderate reasoning' },
    { id: 'high', name: 'High', description: 'Deep reasoning' },
  ] as const;

  const getModelIcon = (model: string) => {
    switch (model) {
      case 'gpt-5': return <Brain className="text-purple-500" size={16} />;
      case 'gpt-5-mini': return <Zap className="text-blue-500" size={16} />;
      case 'gpt-5-nano': return <MessageSquare className="text-green-500" size={16} />;
      default: return <Brain className="text-purple-500" size={16} />;
    }
  };

  return (
    <header className="bg-white border-b border-apple-gray-200 px-6 py-4">
      <div className="flex items-center justify-between max-w-full">
        {/* Left: Current Chat Title */}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-apple-gray-900 truncate">
            {currentTitle || 'New Chat'}
          </h1>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-4">
          {/* Model Selector */}
          <div className="relative">
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-2 px-3 py-2 bg-apple-gray-100 hover:bg-apple-gray-200 rounded-xl transition-colors duration-200"
            >
              {getModelIcon(settings.model)}
              <span className="font-medium text-sm">{settings.model.toUpperCase()}</span>
              <ChevronDown size={16} className={`transition-transform duration-200 ${showModelDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showModelDropdown && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-apple-gray-200 py-2 z-50">
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onSettingsChange({ ...settings, model: model.id });
                      setShowModelDropdown(false);
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-apple-gray-50 transition-colors duration-200 ${
                      settings.model === model.id ? 'bg-apple-blue-50 text-apple-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {getModelIcon(model.id)}
                      <div>
                        <div className="font-medium text-sm">{model.name}</div>
                        <div className="text-xs text-apple-gray-500">{model.description}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Settings Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
              className="flex items-center gap-2 px-3 py-2 text-apple-gray-600 hover:bg-apple-gray-100 rounded-xl transition-colors duration-200"
            >
              <div className="flex items-center gap-2">
                {settings.enableWebSearch && <Globe size={14} className="text-apple-blue-500" />}
                <span className="text-sm font-medium capitalize">{settings.verbosity}</span>
              </div>
              <ChevronDown size={16} className={`transition-transform duration-200 ${showSettingsDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showSettingsDropdown && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-apple-gray-200 p-4 z-50">
                <div className="space-y-4">
                  {/* Verbosity */}
                  <div>
                    <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                      Response Style
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {verbosityLevels.map((level) => (
                        <button
                          key={level.id}
                          onClick={() => onSettingsChange({ ...settings, verbosity: level.id })}
                          className={`p-2 rounded-lg text-xs font-medium transition-colors duration-200 ${
                            settings.verbosity === level.id
                              ? 'bg-apple-blue-500 text-white'
                              : 'bg-apple-gray-100 hover:bg-apple-gray-200 text-apple-gray-700'
                          }`}
                        >
                          <div>{level.name}</div>
                          <div className="text-xs opacity-70">{level.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reasoning Effort */}
                  <div>
                    <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                      Reasoning Effort
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {reasoningLevels.map((level) => (
                        <button
                          key={level.id}
                          onClick={() => onSettingsChange({ ...settings, reasoningEffort: level.id })}
                          className={`p-2 rounded-lg text-xs font-medium transition-colors duration-200 ${
                            settings.reasoningEffort === level.id
                              ? 'bg-apple-blue-500 text-white'
                              : 'bg-apple-gray-100 hover:bg-apple-gray-200 text-apple-gray-700'
                          }`}
                        >
                          <div>{level.name}</div>
                          <div className="text-xs opacity-70">{level.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Web Search Toggle */}
                  <div>
                    <label className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-apple-gray-700">Web Search</span>
                        <p className="text-xs text-apple-gray-500">Allow access to current information</p>
                      </div>
                      <button
                        onClick={() => onSettingsChange({ ...settings, enableWebSearch: !settings.enableWebSearch })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                          settings.enableWebSearch ? 'bg-apple-blue-500' : 'bg-apple-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                            settings.enableWebSearch ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
