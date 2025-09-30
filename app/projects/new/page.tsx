'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { 
  Upload, 
  FileText, 
  X, 
  ArrowLeft, 
  FolderPlus, 
  CheckCircle,
  AlertCircle,
  FileImage,
  FileSpreadsheet,
  File
} from 'lucide-react'
import { apiClient } from '@/lib/apiClient'
import { supabase } from '@/lib/supabaseClient'

interface UploadedFile {
  id: string
  file: File
  preview?: string
  status: 'pending' | 'uploading' | 'completed' | 'error'
  progress: number
  error?: string
}

interface User {
  id: string
  email: string
}

export default function NewProjectPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [globalProgress, setGlobalProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState<'upload' | 'processing' | 'complete'>('upload')

  // Initialize user
  useEffect(() => {
    const initializeUser = async () => {
      try {
        const response = await apiClient.getCurrentUser()
        if (response.data && (response.data as any).user) {
          const userData = response.data as any
          setUser({
            id: userData.user.id,
            email: userData.user.email
          })
        } else {
          router.push('/auth')
        }
      } catch (error) {
        console.error('Error getting current user:', error)
        router.push('/auth')
      }
    }

    initializeUser()
  }, [router])

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return <FileImage className="w-8 h-8 text-blue-500" />
    if (fileType.includes('spreadsheet') || fileType.includes('excel')) return <FileSpreadsheet className="w-8 h-8 text-green-500" />
    if (fileType.includes('pdf') || fileType.includes('document') || fileType.includes('text')) return <FileText className="w-8 h-8 text-red-500" />
    return <File className="w-8 h-8 text-gray-500" />
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const maxFiles = 20
    const currentFileCount = uploadedFiles.length
    const remainingSlots = maxFiles - currentFileCount
    
    if (remainingSlots <= 0) {
      alert('Maximum 20 files allowed')
      return
    }

    const filesToAdd = acceptedFiles.slice(0, remainingSlots)
    
    const newFiles: UploadedFile[] = filesToAdd.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      status: 'pending',
      progress: 0
    }))

    setUploadedFiles(prev => [...prev, ...newFiles])
  }, [uploadedFiles.length])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp']
    },
    maxFiles: 20,
    maxSize: 50 * 1024 * 1024 // 50MB
  })

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const createProject = async () => {
    if (!user || !projectName.trim() || uploadedFiles.length === 0) {
      alert('Please provide a project name and upload at least one file')
      return
    }

    setIsCreating(true)
    setCurrentStep('processing')

    try {
      // Create project in database
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: projectName.trim(),
          description: projectDescription.trim() || null,
          user_id: user.id,
          status: 'processing'
        })
        .select()
        .single()

      if (projectError) throw projectError

      // Create processing job
      const { data: job, error: jobError } = await supabase
        .from('processing_jobs')
        .insert({
          project_id: project.id,
          user_id: user.id,
          job_type: 'file_processing',
          status: 'processing',
          total_files: uploadedFiles.length,
          processed_files: 0,
          progress: 0,
          started_at: new Date().toISOString()
        })
        .select()
        .single()

      if (jobError) throw jobError

      // Process files sequentially
      let processedCount = 0
      
      for (const uploadedFile of uploadedFiles) {
        try {
          // Update file status to uploading
          setUploadedFiles(prev => prev.map(f => 
            f.id === uploadedFile.id 
              ? { ...f, status: 'uploading' as const, progress: 25 }
              : f
          ))

          // Upload file to Supabase Storage
          const fileExt = uploadedFile.file.name.split('.').pop()
          const fileName = `${user.id}/${project.id}/${uploadedFile.id}.${fileExt}`
          
          const { error: uploadError } = await supabase.storage
            .from('project-documents')
            .upload(fileName, uploadedFile.file)

          if (uploadError) throw uploadError

          // Update progress
          setUploadedFiles(prev => prev.map(f => 
            f.id === uploadedFile.id 
              ? { ...f, progress: 50 }
              : f
          ))

          // Get file URL
          const { data: urlData } = supabase.storage
            .from('project-documents')
            .getPublicUrl(fileName)

          // Save document record to database
          const { data: document, error: docError } = await supabase
            .from('project_documents')
            .insert({
              project_id: project.id,
              user_id: user.id,
              filename: fileName,
              original_filename: uploadedFile.file.name,
              file_type: uploadedFile.file.type,
              file_size: uploadedFile.file.size,
              file_url: urlData.publicUrl,
              processing_status: 'pending'
            })
            .select()
            .single()

          if (docError) throw docError

          // Start text extraction
          setUploadedFiles(prev => prev.map(f => 
            f.id === uploadedFile.id 
              ? { ...f, progress: 75 }
              : f
          ))

          // Call text extraction API
          const extractResponse = await fetch('/api/extract-text', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
            },
            body: JSON.stringify({
              documentId: document.id,
              projectId: project.id,
              fileUrl: urlData.publicUrl,
              fileName: uploadedFile.file.name,
              fileType: uploadedFile.file.type
            })
          })

          if (!extractResponse.ok) {
            throw new Error('Text extraction failed')
          }

          // Update file status to completed
          setUploadedFiles(prev => prev.map(f => 
            f.id === uploadedFile.id 
              ? { ...f, status: 'completed' as const, progress: 100 }
              : f
          ))

          processedCount++
          
          // Update job progress
          const jobProgress = Math.round((processedCount / uploadedFiles.length) * 100)
          setGlobalProgress(jobProgress)
          
          await supabase
            .from('processing_jobs')
            .update({
              processed_files: processedCount,
              progress: jobProgress,
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id)

        } catch (fileError) {
          console.error(`Error processing file ${uploadedFile.file.name}:`, fileError)
          
          // Update file status to error
          setUploadedFiles(prev => prev.map(f => 
            f.id === uploadedFile.id 
              ? { 
                  ...f, 
                  status: 'error' as const, 
                  error: fileError instanceof Error ? fileError.message : 'Unknown error'
                }
              : f
          ))
        }
      }

      // Complete the job
      await supabase
        .from('processing_jobs')
        .update({
          status: 'completed',
          progress: 100,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id)

      // Update project status
      await supabase
        .from('projects')
        .update({
          status: 'completed'
        })
        .eq('id', project.id)

      setCurrentStep('complete')
      
      // Auto-redirect after 2 seconds
      setTimeout(() => {
        router.push(`/projects/${project.id}`)
      }, 2000)

    } catch (error) {
      console.error('Error creating project:', error)
      setCurrentStep('upload')
      alert('Error creating project. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <FolderPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Create New Project</h1>
              <p className="text-sm text-gray-500">Upload documents and create an AI-powered knowledge base</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {currentStep === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: File Upload */}
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Documents</h2>
                
                {/* Dropzone */}
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                    isDragActive 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <input {...getInputProps()} />
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-900 mb-2">
                    {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
                  </p>
                  <p className="text-gray-500 mb-4">
                    or click to browse files
                  </p>
                  <p className="text-sm text-gray-400">
                    Supports PDF and Images (PNG, JPG, GIF, BMP, TIFF, WebP)<br />
                    Max 20 files, 50MB each
                  </p>
                </div>

                {/* File List */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900">
                        Uploaded Files ({uploadedFiles.length}/20)
                      </h3>
                    </div>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {uploadedFiles.map((uploadedFile) => (
                        <div
                          key={uploadedFile.id}
                          className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg"
                        >
                          {getFileIcon(uploadedFile.file.type)}
                          
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {uploadedFile.file.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatFileSize(uploadedFile.file.size)}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {uploadedFile.status === 'completed' && (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            )}
                            {uploadedFile.status === 'error' && (
                              <AlertCircle className="w-5 h-5 text-red-500" />
                            )}
                            {uploadedFile.status === 'pending' && (
                              <button
                                onClick={() => removeFile(uploadedFile.id)}
                                className="p-1 hover:bg-gray-100 rounded"
                              >
                                <X className="w-4 h-4 text-gray-400" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Project Details */}
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Project Details</h2>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-2">
                      Project Name *
                    </label>
                    <input
                      type="text"
                      id="projectName"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="Enter project name..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      maxLength={100}
                    />
                  </div>

                  <div>
                    <label htmlFor="projectDescription" className="block text-sm font-medium text-gray-700 mb-2">
                      Description (optional)
                    </label>
                    <textarea
                      id="projectDescription"
                      value={projectDescription}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      placeholder="Describe what this project is about..."
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      maxLength={500}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {projectDescription.length}/500 characters
                    </p>
                  </div>
                </div>
              </div>

              {/* Create Project Button */}
              <div className="border-t border-gray-200 pt-6">
                <button
                  onClick={createProject}
                  disabled={!projectName.trim() || uploadedFiles.length === 0 || isCreating}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
                >
                  {isCreating ? 'Creating Project...' : 'Create Project'}
                </button>
                
                {(!projectName.trim() || uploadedFiles.length === 0) && (
                  <p className="text-sm text-gray-500 mt-2 text-center">
                    {!projectName.trim() ? 'Please enter a project name' : 'Please upload at least one file'}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {currentStep === 'processing' && (
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <FolderPlus className="w-8 h-8 text-blue-600" />
            </div>
            
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Creating Your Project
              </h2>
              <p className="text-gray-600">
                We're processing your documents and building your knowledge base...
              </p>
            </div>

            {/* Global Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>File text extraction / project memory updating</span>
                <span>{globalProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${globalProgress}%` }}
                />
              </div>
            </div>

            {/* File Status List */}
            <div className="text-left max-w-md mx-auto space-y-2">
              {uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-center gap-3 p-2 rounded">
                  {file.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
                  {file.status === 'uploading' && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                  {file.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                  {file.status === 'pending' && <div className="w-4 h-4 border-2 border-gray-300 rounded-full flex-shrink-0" />}
                  
                  <span className="text-sm text-gray-700 truncate">{file.file.name}</span>
                  
                  {file.status === 'uploading' && (
                    <span className="text-xs text-gray-500 ml-auto">{file.progress}%</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === 'complete' && (
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Project Created Successfully!
              </h2>
              <p className="text-gray-600">
                Your knowledge base is ready. Redirecting to your project...
              </p>
            </div>

            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        )}
      </div>
    </div>
  )
}
