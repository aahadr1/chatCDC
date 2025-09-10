// Secure API client for server-side operations
// This replaces direct Supabase client calls from the browser

interface ApiResponse<T = any> {
  data?: T
  error?: string
  message?: string
}

class ApiClient {
  private baseUrl: string
  private accessToken: string | null = null

  constructor() {
    this.baseUrl = '/api'
  }

  // Set the access token for authenticated requests
  setAccessToken(token: string | null) {
    this.accessToken = token
  }

  // Get headers for authenticated requests
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }

    return headers
  }

  // Generic request method
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          error: data.error || `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      return { data }
    } catch (error) {
      console.error('API request error:', error)
      return {
        error: error instanceof Error ? error.message : 'Network error',
      }
    }
  }

  // Authentication methods
  async signIn(email: string, password: string) {
    return this.request('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  }

  async signUp(email: string, password: string, fullName: string) {
    return this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    })
  }

  async signOut() {
    return this.request('/auth/signout', {
      method: 'POST',
    })
  }

  async getCurrentUser() {
    return this.request('/auth/me')
  }

  async resetPassword(email: string) {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  // Projects methods
  async getProjects(search?: string, status?: string) {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (status && status !== 'all') params.append('status', status)
    
    const queryString = params.toString()
    return this.request(`/projects${queryString ? `?${queryString}` : ''}`)
  }

  async getProject(id: string) {
    return this.request(`/projects/${id}`)
  }

  async createProject(name: string, description?: string) {
    return this.request('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    })
  }

  async updateProject(id: string, updates: { name?: string; description?: string; status?: string }) {
    return this.request(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  }

  async deleteProject(id: string) {
    return this.request(`/projects/${id}`, {
      method: 'DELETE',
    })
  }

  // Project documents methods
  async getProjectDocuments(projectId: string) {
    return this.request(`/projects/${projectId}/documents`)
  }

  // Conversations methods
  async getConversations() {
    return this.request('/conversations')
  }

  async getConversation(id: string) {
    return this.request(`/conversations/${id}`)
  }

  async createConversation(title: string) {
    return this.request('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  }

  async updateConversation(id: string, updates: { title?: string }) {
    return this.request(`/conversations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  }

  async deleteConversation(id: string) {
    return this.request(`/conversations/${id}`, {
      method: 'DELETE',
    })
  }

  // Project conversations methods
  async getProjectConversations(projectId: string) {
    return this.request(`/projects/${projectId}/conversations`)
  }

  async createProjectConversation(projectId: string, title: string) {
    return this.request(`/projects/${projectId}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  }

  // Messages methods
  async getMessages(conversationId: string) {
    return this.request(`/conversations/${conversationId}/messages`)
  }

  async createMessage(conversationId: string, content: string, role: 'user' | 'assistant') {
    return this.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, role }),
    })
  }

  // Project messages methods
  async getProjectMessages(projectId: string, conversationId: string) {
    return this.request(`/projects/${projectId}/conversations/${conversationId}/messages`)
  }

  async createProjectMessage(projectId: string, conversationId: string, content: string, role: 'user' | 'assistant') {
    return this.request(`/projects/${projectId}/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, role }),
    })
  }

  // File upload methods
  async uploadFiles(files: File[], projectId: string) {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    formData.append('projectId', projectId)

    try {
      const url = `${this.baseUrl}/files/upload`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          error: data.error || `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      return { data }
    } catch (error) {
      console.error('File upload error:', error)
      return {
        error: error instanceof Error ? error.message : 'Upload failed',
      }
    }
  }

  async getFile(id: string) {
    return this.request(`/files/${id}`)
  }

  async deleteFile(id: string) {
    return this.request(`/files/${id}`, {
      method: 'DELETE',
    })
  }

  // Chat methods (streaming)
  async sendChatMessage(messages: any[], conversationId: string, userId: string) {
    try {
      const url = `${this.baseUrl}/chat`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          messages,
          conversationId,
          userId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Chat request failed')
      }

      return response
    } catch (error) {
      console.error('Chat request error:', error)
      throw error
    }
  }

  // Project chat methods (streaming)
  async sendProjectChatMessage(
    messages: any[],
    projectId: string,
    conversationId: string,
    userId: string,
    knowledgeBase: string
  ) {
    try {
      const url = `${this.baseUrl}/project-chat`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          messages,
          projectId,
          conversationId,
          userId,
          knowledgeBase,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Project chat request failed')
      }

      return response
    } catch (error) {
      console.error('Project chat request error:', error)
      throw error
    }
  }
}

// Create and export a singleton instance
export const apiClient = new ApiClient()
export default apiClient
