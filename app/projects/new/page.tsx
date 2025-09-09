'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, FileText, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewProjectPage() {
  const router = useRouter();
  const [projectName, setProjectName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    
    const pdfFiles = Array.from(selectedFiles).filter(file => file.type === 'application/pdf');
    const newFiles = [...files, ...pdfFiles].slice(0, 20); // Max 20 files
    setFiles(newFiles);
    setError(null);
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }

    if (files.length === 0) {
      setError('At least one PDF file is required');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Create project
      const projectResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName.trim() }),
      });

      if (!projectResponse.ok) {
        throw new Error('Failed to create project');
      }

      const { project } = await projectResponse.json();

      // Upload files
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      const uploadResponse = await fetch(`/api/projects/${project.id}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload files');
      }

      // Redirect to project chat
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-apple-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link 
            href="/"
            className="p-2 hover:bg-white rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-apple-gray-900">Create New Project</h1>
            <p className="text-apple-gray-600 mt-1">Upload PDFs and start chatting with your documents</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Project Details */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-apple-gray-200 p-6">
              <h2 className="text-lg font-semibold text-apple-gray-900 mb-4">Project Details</h2>
              
              <div>
                <label className="block text-sm font-medium text-apple-gray-700 mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name..."
                  className="w-full px-4 py-3 border border-apple-gray-200 rounded-lg focus:ring-2 focus:ring-apple-blue-500 focus:border-transparent outline-none transition-colors"
                  disabled={uploading}
                />
              </div>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-apple-gray-200 p-6">
                <h3 className="text-lg font-semibold text-apple-gray-900 mb-4">
                  Uploaded Files ({files.length}/20)
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-apple-gray-50 rounded-lg">
                      <FileText size={20} className="text-apple-red-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-apple-gray-900 truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-apple-gray-500">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        className="p-1 hover:bg-apple-gray-200 rounded transition-colors"
                        disabled={uploading}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: File Upload */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-apple-gray-200 p-6">
              <h2 className="text-lg font-semibold text-apple-gray-900 mb-4">Source Upload</h2>
              <p className="text-sm text-apple-gray-600 mb-4">
                Upload up to 20 PDF documents. Text will be extracted automatically for AI analysis.
              </p>

              {/* Upload Area */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-apple-gray-300 rounded-lg p-8 text-center hover:border-apple-blue-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={48} className="mx-auto mb-4 text-apple-gray-400" />
                <p className="text-lg font-medium text-apple-gray-700 mb-2">
                  Drop PDF files here or click to browse
                </p>
                <p className="text-sm text-apple-gray-500">
                  Supports PDF files up to 10MB each
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                  disabled={uploading}
                />
              </div>

              {files.length >= 20 && (
                <p className="text-sm text-apple-orange-600 mt-2">
                  Maximum of 20 files reached
                </p>
              )}
            </div>

            {/* Create Button */}
            <div className="bg-white rounded-xl shadow-sm border border-apple-gray-200 p-6">
              {error && (
                <div className="mb-4 p-3 bg-apple-red-50 border border-apple-red-200 rounded-lg">
                  <p className="text-sm text-apple-red-600">{error}</p>
                </div>
              )}

              <button
                onClick={handleCreateProject}
                disabled={uploading || !projectName.trim() || files.length === 0}
                className="w-full btn-primary py-3 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Creating Project...
                  </>
                ) : (
                  <>
                    Create Project
                  </>
                )}
              </button>

              <p className="text-xs text-apple-gray-500 mt-2 text-center">
                Files will be processed in the background. You'll be redirected to start chatting once ready.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
