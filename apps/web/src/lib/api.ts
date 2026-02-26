const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
if (!API_URL) console.error('🚨 CRITICAL: API_URL is undefined! Check your .env file.');

export interface RegisterData {
  email: string;
  username: string;
  password: string;
  fullName?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  fullName?: string;
  avatar?: string;
  status: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Channel {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  unreadCount?: number;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  joinedAt: string;
  updatedAt: string;
  user?: Pick<User, 'id' | 'username' | 'fullName' | 'avatar'>;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  owner?: Pick<User, 'id' | 'email' | 'username' | 'fullName' | 'avatar'>;
  channels?: Channel[];
  members?: WorkspaceMember[];
  _count?: { members: number };
}

export interface CreateWorkspaceData {
  name: string;
}

export interface CreateChannelData {
  name: string;
}

export interface Reaction {
  id: string;
  emoji: string;
  userId: string;
  messageId: string;
  createdAt: string;
  user?: Pick<User, 'id' | 'username' | 'fullName' | 'avatar'>;
}

export interface MentionUser {
  id: string;
  username: string;
  fullName?: string | null;
  avatar?: string | null;
}

export interface Message {
  id: string;
  content: string;
  userId: string;
  channelId: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    fullName?: string;
    avatar?: string;
  };
  reactions: Reaction[];
  mentions?: MentionUser[];
  _count?: { replies: number };
  isEdited?: boolean;
  fileUrl?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  originalName?: string | null;
}

export interface DirectConversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  unreadCount?: number;
  participants: {
    id: string;
    userId: string;
    user: {
      id: string;
      username: string;
      fullName: string | null;
      avatar: string | null;
      status: string;
    };
  }[];
  messages: {
    id: string;
    content: string | null;
    fileType: string | null;
    originalName: string | null;
    createdAt: string;
    senderId: string;
  }[];
}

export interface CreateMessageData {
  content: string;
}

export interface SearchResult {
  id: string;
  content: string;
  channelId: string;
  channelName: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  similarity: number;
  user: {
    id: string;
    username: string;
    fullName: string | null;
    avatar: string | null;
  };
}

export interface MessagesResponse {
  messages: Message[];
  nextCursor: string | null;
}

export interface DigestUnreadChannel {
  channelId: string;
  channelName: string;
  messageCount: number;
  mentionCount: number;
}

export interface DigestUnreadDm {
  conversationId: string;
  withUser: string;
  messageCount: number;
}

export interface DigestResponse {
  allCaughtUp: boolean;
  aiSummary: string | null;
  unreadChannels: DigestUnreadChannel[];
  unreadDms: DigestUnreadDm[];
  totalMentions: number;
  totalUnread: number;
  cachedAt: string;
}

class ApiClient {
  private getHeaders(token?: string): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }

    return response.json();
  }

  async login(data: LoginData): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    return response.json();
  }

  async getProfile(token: string): Promise<User> {
    const response = await fetch(`${API_URL}/auth/profile`, {
      method: 'GET',
      headers: this.getHeaders(token),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch profile');
    }

    return response.json();
  }

  async logout(token: string): Promise<void> {
    const response = await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: this.getHeaders(token),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Logout failed');
    }
  }

  // Workspace methods
  async getWorkspaces(token: string): Promise<Workspace[]> {
    const response = await fetch(`${API_URL}/workspaces`, {
      method: 'GET',
      headers: this.getHeaders(token),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch workspaces');
    }

    return response.json();
  }

  async createWorkspace(token: string, data: CreateWorkspaceData): Promise<Workspace> {
    const response = await fetch(`${API_URL}/workspaces`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create workspace');
    }

    return response.json();
  }

  async getChannels(workspaceId: string, token: string): Promise<Channel[]> {
    const response = await fetch(`${API_URL}/workspaces/${workspaceId}/channels`, {
      headers: this.getHeaders(token),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch channels');
    }

    return response.json();
  }

  async createChannel(workspaceId: string, data: { name: string }, token: string): Promise<Channel> {
    const response = await fetch(`${API_URL}/workspaces/${workspaceId}/channels`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create channel');
    }

    return response.json();
  }

  async getMessages(
    channelId: string,
    token: string,
    limit: number = 50,
    cursor?: string,
    parentId?: string,
  ): Promise<{ messages: Message[]; nextCursor: string | null }> {
    let url = `${API_URL}/channels/${channelId}/messages?limit=${limit}`;
    if (cursor) url += `&cursor=${cursor}`;
    if (parentId) url += `&parentId=${encodeURIComponent(parentId)}`;

    const response = await fetch(url, {
      headers: this.getHeaders(token),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch messages');
    }

    return response.json();
  }

  async sendMessage(
    channelId: string,
    content: string,
    token: string,
    parentId?: string,
    mentionIds?: string[],
    fileUrl?: string,
    fileType?: string,
    fileSize?: number,
    originalName?: string,
  ): Promise<Message> {
    const response = await fetch(`${API_URL}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({
        // Send content only if non-empty; backend accepts null/absent when fileUrl present
        ...(content ? { content } : {}),
        ...(parentId && { parentId }),
        ...(mentionIds?.length && { mentionIds }),
        ...(fileUrl && { fileUrl }),
        ...(fileType && { fileType }),
        ...(fileSize && { fileSize }),
        ...(originalName && { originalName }),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      // NestJS validation errors are often arrays of strings
      const errorMessage = Array.isArray(error.message)
        ? error.message.join(', ')
        : error.message;
      throw new Error(errorMessage || 'Failed to send message');
    }

    return response.json();
  }

  // Discover workspaces the user has not yet joined
  async discoverWorkspaces(token: string): Promise<Workspace[]> {
    const response = await fetch(`${API_URL}/workspaces/discover`, {
      method: 'GET',
      headers: this.getHeaders(token),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to discover workspaces');
    }

    return response.json();
  }

  async addReaction(channelId: string, messageId: string, emoji: string, token: string): Promise<Reaction> {
    const response = await fetch(
      `${API_URL}/channels/${channelId}/messages/${messageId}/reactions`,
      {
        method: 'POST',
        headers: this.getHeaders(token),
        body: JSON.stringify({ emoji }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to add reaction');
    }

    return response.json();
  }

  async removeReaction(channelId: string, messageId: string, reactionId: string, token: string): Promise<void> {
    const response = await fetch(
      `${API_URL}/channels/${channelId}/messages/${messageId}/reactions/${reactionId}`,
      {
        method: 'DELETE',
        headers: this.getHeaders(token),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to remove reaction');
    }
  }

  // Fetch all existing read receipts for a channel
  async getReadReceipts(channelId: string, token: string): Promise<{ userId: string; messageId: string; readAt: string }[]> {
    const response = await fetch(`${API_URL}/channels/${channelId}/read`, {
      headers: this.getHeaders(token),
    });
    if (!response.ok) return [];
    return response.json();
  }

  // Mark a channel as read up to the given messageId (upserted per user per channel)
  async markChannelAsRead(channelId: string, messageId: string, token: string): Promise<void> {
    const response = await fetch(`${API_URL}/channels/${channelId}/read`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({ messageId }),
    });

    if (!response.ok) {
      // Non-fatal — silently ignore read-receipt errors so they never break the UI
      console.warn('[api] markChannelAsRead failed:', response.status);
    }
  }

  // Phase 11.3: Find semantically related messages for a given message
  async getRelatedMessages(
    token: string,
    params: { messageId: string; workspaceId: string; limit?: number },
  ): Promise<{ messages: SearchResult[]; total: number }> {
    const { messageId, workspaceId, limit = 8 } = params;
    const url = `${API_URL}/search/related/${encodeURIComponent(messageId)}?workspaceId=${encodeURIComponent(workspaceId)}&limit=${limit}`;
    const response = await fetch(url, { headers: this.getHeaders(token) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to fetch related messages');
    }
    return response.json();
  }

  // Search messages via hybrid semantic + trigram similarity (Phase 11.2)
  async hybridSearchMessages(
    token: string,
    params: { q: string; workspaceId: string; limit?: number },
  ): Promise<{ messages: SearchResult[]; nextCursor: string | null; total: number; searchMode?: string }> {
    const { q, workspaceId, limit = 30 } = params;
    const url = `${API_URL}/search/hybrid?q=${encodeURIComponent(q)}&workspaceId=${encodeURIComponent(workspaceId)}&limit=${limit}`;
    const response = await fetch(url, { headers: this.getHeaders(token) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Hybrid search failed');
    }
    return response.json();
  }

  // Search messages via pg_trgm similarity
  async searchMessages(
    token: string,
    params: {
      q: string;
      workspaceId: string;
      limit?: number;
      cursor?: string;
    },
  ): Promise<{ messages: SearchResult[]; nextCursor: string | null; total: number }> {
    const qs = new URLSearchParams({
      q: params.q,
      workspaceId: params.workspaceId,
      ...(params.limit !== undefined && { limit: String(params.limit) }),
      ...(params.cursor && { cursor: params.cursor }),
    });
    const response = await fetch(`${API_URL}/search?${qs.toString()}`, {
      headers: this.getHeaders(token),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Search failed');
    }
    return response.json();
  }

  // Edit a message
  async editMessage(channelId: string, messageId: string, content: string, token: string): Promise<Message> {
    const response = await fetch(
      `${API_URL}/channels/${channelId}/messages/${messageId}`,
      {
        method: 'PATCH',
        headers: this.getHeaders(token),
        body: JSON.stringify({ content }),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to edit message');
    }

    return response.json();
  }

  // Delete a message
  async deleteMessage(channelId: string, messageId: string, token: string): Promise<void> {
    const response = await fetch(
      `${API_URL}/channels/${channelId}/messages/${messageId}`,
      {
        method: 'DELETE',
        headers: this.getHeaders(token),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to delete message');
    }
  }

  async renameWorkspace(token: string, workspaceId: string, name: string): Promise<Workspace> {
    const response = await fetch(`${API_URL}/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: this.getHeaders(token),
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Failed to rename workspace');
    return response.json();
  }

  async deleteWorkspace(token: string, workspaceId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_URL}/workspaces/${workspaceId}`, {
      method: 'DELETE',
      headers: this.getHeaders(token),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Failed to delete workspace');
    return response.json();
  }

  async renameChannel(token: string, channelId: string, name: string): Promise<Channel> {
    const response = await fetch(`${API_URL}/channels/${channelId}`, {
      method: 'PATCH',
      headers: this.getHeaders(token),
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Failed to rename channel');
    return response.json();
  }

  async deleteChannel(token: string, channelId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_URL}/channels/${channelId}`, {
      method: 'DELETE',
      headers: this.getHeaders(token),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Failed to delete channel');
    return response.json();
  }

  // Join a public workspace by id
  async joinWorkspace(token: string, workspaceId: string): Promise<Workspace> {
    const response = await fetch(`${API_URL}/workspaces/${workspaceId}/join`, {
      method: 'POST',
      headers: this.getHeaders(token),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to join workspace');
    }

    return response.json();
  }

  // Upload a file attachment
  async uploadFile(
    token: string,
    file: File,
  ): Promise<{ url: string; filename: string; originalName: string; mimeType: string; size: number; fileSize: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }, // no Content-Type — browser sets it with boundary
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Upload failed');
    }

    return response.json();
  }

  // ─── Direct Messaging ──────────────────────────────────────────────────────

  async startDirectConversation(token: string, recipientId: string): Promise<DirectConversation> {
    const res = await fetch(`${API_URL}/direct/start`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({ recipientId }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to start conversation');
    return res.json();
  }

  async getDirectConversations(token: string): Promise<DirectConversation[]> {
    const res = await fetch(`${API_URL}/direct`, { headers: this.getHeaders(token) });
    if (!res.ok) return [];
    return res.json();
  }

  async getWorkspaceUsersForDM(token: string, workspaceId: string): Promise<{ user: { id: string; username: string; fullName: string | null; avatar: string | null; status: string } }[]> {
    const res = await fetch(`${API_URL}/direct/workspace/${workspaceId}/users`, {
      headers: this.getHeaders(token),
    });
    if (!res.ok) return [];
    return res.json();
  }

  /** Mark a channel as read for the current user (clears unread badge). */
  async markChannelRead(token: string, channelId: string): Promise<void> {
    const res = await fetch(`${API_URL}/channels/${channelId}/mark-read`, {
      method: 'POST',
      headers: this.getHeaders(token),
    });
    if (!res.ok) console.warn('[api] markChannelRead failed:', res.status);
  }

  /**
   * Request a channel AI summary (async — returns 202 + jobId).
   * The actual summary is delivered via WebSocket event `summary_generated`.
   */
  async requestChannelSummary(token: string, channelId: string): Promise<{ status: string; jobId: string; message: string }> {
    try {
      const res = await fetch(`${API_URL}/channels/${channelId}/messages/summary`, {
        method: 'POST',
        headers: this.getHeaders(token),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Server returned ${res.status}: ${body || 'Failed to queue summary job'}`);
      }
      return res.json();
    } catch (err) {
      if (err instanceof TypeError) {
        console.error('🌐 Network error on requestChannelSummary:', err);
        throw new Error('Cannot reach the backend server. Is it running, and is CORS configured?');
      }
      throw err;
    }
  }

  /**
   * Request a DM AI summary (async — returns 202 + jobId).
   * The actual summary is delivered via WebSocket event `summary_generated`.
   */
  async requestDmSummary(token: string, conversationId: string): Promise<{ status: string; jobId: string; message: string }> {
    try {
      const res = await fetch(`${API_URL}/direct/${conversationId}/summary`, {
        method: 'POST',
        headers: this.getHeaders(token),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Server returned ${res.status}: ${body || 'Failed to queue DM summary job'}`);
      }
      return res.json();
    } catch (err) {
      if (err instanceof TypeError) {
        console.error('🌐 Network error on requestDmSummary:', err);
        throw new Error('Cannot reach the backend server. Is it running, and is CORS configured?');
      }
      throw err;
    }
  }

  /** Mark a DM conversation as read for the current user (clears unread badge). */
  async markDmRead(token: string, conversationId: string): Promise<void> {
    const res = await fetch(`${API_URL}/direct/${conversationId}/mark-read`, {
      method: 'POST',
      headers: this.getHeaders(token),
    });
    if (!res.ok) console.warn('[api] markDmRead failed:', res.status);
  }

  // ── User Profile ──────────────────────────────────────────────────────────

  /** GET /users/me — fetch current user profile */
  async getMe(token: string): Promise<{ id: string; email: string; username: string; fullName: string | null; avatar: string | null; status: string }> {
    const res = await fetch(`${API_URL}/users/me`, {
      headers: this.getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to fetch profile');
    return res.json();
  }

  /** PATCH /users/me — update fullName, username, avatarUrl */
  async updateProfile(token: string, data: { fullName?: string; username?: string; avatarUrl?: string }): Promise<{ id: string; email: string; username: string; fullName: string | null; avatar: string | null }> {
    const res = await fetch(`${API_URL}/users/me`, {
      method: 'PATCH',
      headers: this.getHeaders(token),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to update profile');
    }
    return res.json();
  }

  /** PATCH /users/me/password — change password */
  async changePassword(token: string, data: { currentPassword: string; newPassword: string }): Promise<{ message: string }> {
    const res = await fetch(`${API_URL}/users/me/password`, {
      method: 'PATCH',
      headers: this.getHeaders(token),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to change password');
    }
    return res.json();
  }

  // ── AI Notification Digest (Phase 11.4) ──────────────────────────────────

  /**
   * GET /users/me/digest
   * Returns an AI-generated summary of the current user's unread activity.
   * Cached server-side in Redis for 5 minutes.
   */
  async getDigest(token: string): Promise<DigestResponse> {
    const res = await fetch(`${API_URL}/users/me/digest`, {
      headers: this.getHeaders(token),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch digest');
    }
    return res.json();
  }

  /**
   * POST /users/me/digest/invalidate
   * Clears the cached digest so the next GET regenerates fresh.
   */
  async invalidateDigest(token: string): Promise<{ invalidated: boolean }> {
    const res = await fetch(`${API_URL}/users/me/digest/invalidate`, {
      method: 'POST',
      headers: this.getHeaders(token),
    });
    if (!res.ok) return { invalidated: false };
    return res.json();
  }

  // ── Leave / Hide ──────────────────────────────────────────────────────────

  /** POST /workspaces/:id/leave — leave a workspace (non-owners only) */
  async leaveWorkspace(token: string, workspaceId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_URL}/workspaces/${workspaceId}/leave`, {
      method: 'POST',
      headers: this.getHeaders(token),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to leave workspace');
    return res.json();
  }

  /** POST /channels/:id/leave — leave a channel (non-owners only) */
  async leaveChannel(token: string, channelId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_URL}/channels/${channelId}/leave`, {
      method: 'POST',
      headers: this.getHeaders(token),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to leave channel');
    return res.json();
  }

  /** POST /direct/:id/hide — hide a DM conversation from sidebar */
  async hideDmConversation(token: string, conversationId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_URL}/direct/${conversationId}/hide`, {
      method: 'POST',
      headers: this.getHeaders(token),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to hide conversation');
    return res.json();
  }
}

export const api = new ApiClient();
