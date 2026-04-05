import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';

const API_BASE_URL = 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────
export const authAPI = {
  register: (data: { email: string; password: string; username: string; display_name: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
};

// ── Posts ──────────────────────────────────
export const postsAPI = {
  getFeed: (limit = 20, offset = 0) =>
    api.get('/posts/feed', { params: { limit, offset } }),
  getPosts: (limit = 20, offset = 0, userId?: string) =>
    api.get('/posts', { params: { limit, offset, user_id: userId } }),
  getPost: (id: string) => api.get(`/posts/${id}`),
  createPost: (data: { content: string; media_url?: string; media_type?: string; tags?: string[] }) =>
    api.post('/posts', data),
  deletePost: (id: string) => api.delete(`/posts/${id}`),
};

// ── Social ────────────────────────────────
export const socialAPI = {
  likePost: (postId: string) => api.post(`/posts/${postId}/like`),
  unlikePost: (postId: string) => api.delete(`/posts/${postId}/like`),
  getComments: (postId: string) => api.get(`/posts/${postId}/comments`),
  addComment: (postId: string, content: string) =>
    api.post(`/posts/${postId}/comments`, { content }),
  deleteComment: (commentId: string) => api.delete(`/comments/${commentId}`),
};

// ── Users ─────────────────────────────────
export const usersAPI = {
  getMe: () => api.get('/users/me'),
  getUser: (userId: string) => api.get(`/users/${userId}`),
  updateProfile: (data: { display_name?: string; bio?: string; avatar_url?: string; cover_url?: string }) =>
    api.put('/users/me', data),
  searchUsers: (query: string) => api.get('/users/search', { params: { q: query } }),
  follow: (userId: string) => api.post(`/users/${userId}/follow`),
  unfollow: (userId: string) => api.delete(`/users/${userId}/follow`),
  getFollowers: (userId: string) => api.get(`/users/${userId}/followers`),
  getFollowing: (userId: string) => api.get(`/users/${userId}/following`),
};

// ── Messages ──────────────────────────────
export const messagesAPI = {
  getConversations: () => api.get('/messages/conversations'),
  getMessages: (partnerId: string, limit = 50) =>
    api.get(`/messages/${partnerId}`, { params: { limit } }),
  sendMessage: (receiverId: string, content: string) =>
    api.post('/messages', { receiver_id: receiverId, content }),
};

// ── Notifications ─────────────────────────
export const notificationsAPI = {
  getNotifications: (limit = 30, unreadOnly = false) =>
    api.get('/notifications', { params: { limit, unread_only: unreadOnly } }),
  markAllRead: () => api.put('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
};

// ── Media Upload (direct to Supabase Storage) ─────────────────
export const mediaAPI = {
  /**
   * Uploads a file directly to Supabase Storage bucket 'post-media'.
   * Requires the Supabase JS client to have a valid session (set after login).
   * Returns the public URL of the uploaded file.
   */
  uploadPostMedia: async (file: File, userId: string): Promise<string> => {
    const ext = file.name.split('.').pop() ?? 'bin';
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('post-media')
      .upload(path, file, { upsert: false });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from('post-media').getPublicUrl(path);
    return data.publicUrl;
  },
};

export default api;
