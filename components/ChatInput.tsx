'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Send, Paperclip, Image as ImageIcon, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

interface ChatInputProps {
  onSendMessage: (content: string, images?: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ 
  onSendMessage, 
  disabled = false, 
  placeholder = "Type your message..." 
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<string[]>([]); // preview URLs
  const [files, setFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && files.length === 0) return;

    // Upload files to Supabase Storage and collect public URLs
    let uploadedUrls: string[] | undefined = undefined;
    if (files.length > 0) {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const bucket = supabase.storage.from('chatcdc');
      const uploads = await Promise.all(
        files.map(async (file, idx) => {
          const path = `${userId}/${Date.now()}-${idx}-${uuidv4()}-${file.name}`;
          const { error } = await bucket.upload(path, file, { upsert: false });
          if (error) throw error;
          const { data } = bucket.getPublicUrl(path);
          return data.publicUrl;
        })
      );
      uploadedUrls = uploads;
    }

    onSendMessage(message.trim(), uploadedUrls);

    setMessage('');
    setImages([]);
    setFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [message, files, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
    if (selected.length === 0) return;

    setFiles(prev => [...prev, ...selected]);
    const previews = selected.map(file => URL.createObjectURL(file));
    setImages(prev => [...prev, ...previews]);

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="bg-white border-t border-apple-gray-200 p-4">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        {/* Image Previews */}
        {images.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {images.map((image, index) => (
              <div key={index} className="relative">
                <img
                  src={image}
                  alt={`Upload preview ${index + 1}`}
                  className="w-16 h-16 object-cover rounded-lg border border-apple-gray-200"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-apple-red-500 text-white rounded-full flex items-center justify-center hover:bg-apple-red-600 transition-colors duration-200"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Container */}
        <div className="relative flex items-end gap-3 bg-apple-gray-50 rounded-2xl p-3 border border-apple-gray-200 focus-within:border-apple-blue-500 focus-within:ring-2 focus-within:ring-apple-blue-500/20 transition-all duration-200">
          {/* File Upload Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="flex-shrink-0 p-2 text-apple-gray-500 hover:text-apple-blue-500 hover:bg-apple-blue-50 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Upload image"
          >
            <ImageIcon size={20} />
          </button>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 bg-transparent border-none outline-none resize-none min-h-[24px] max-h-[120px] text-apple-gray-900 placeholder-apple-gray-500 disabled:opacity-50"
            rows={1}
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={disabled || (!message.trim() && images.length === 0)}
            className="flex-shrink-0 p-2 bg-apple-blue-500 text-white rounded-xl hover:bg-apple-blue-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-apple-blue-500"
          >
            <Send size={20} />
          </button>
        </div>

        {/* Helper Text */}
        <div className="mt-2 text-xs text-apple-gray-500 text-center">
          Press Enter to send, Shift+Enter for new line
        </div>
      </form>
    </div>
  );
}
