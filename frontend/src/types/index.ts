export interface User {
  user_id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  cover_url: string;
  follower_count: number;
  following_count: number;
  post_count: number;
  connection_count: number;
  is_following: boolean;
}

export interface Post {
  post_id: string;
  user_id: string;
  content: string;
  media_url: string;
  media_type: 'image' | 'video' | 'none';
  created_at: string;
  username: string;
  display_name: string;
  avatar_url: string;
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  tags: string[];
}

export interface Comment {
  comment_id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface Message {
  message_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  sender_username: string;
  sender_display_name: string;
  sender_avatar_url: string;
}

export interface ConversationPreview {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export interface Notification {
  notification_id: string;
  user_id: string;
  actor_id: string | null;
  type: 'like' | 'comment' | 'follow' | 'message';
  content: string;
  ref_id: string | null;
  is_read: boolean;
  created_at: string;
  actor_username: string;
  actor_display_name: string;
  actor_avatar_url: string;
}

export interface AuthResponse {
  access_token: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

// ── Connections ────────────────────────────────────────
export type ConnectionStatus =
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'connected'
  | 'self';

export interface ConnectionUserMini {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
}

export interface Connection {
  connection_id: string;
  user: ConnectionUserMini;
  status: 'accepted' | 'pending_sent' | 'pending_received';
  created_at: string;
}

export interface ConnectionStatusResponse {
  status: ConnectionStatus;
  connection_id: string | null;
}
