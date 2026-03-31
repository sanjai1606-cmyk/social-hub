import { useState, useEffect, useRef } from 'react';
import type { ConversationPreview, Message } from '../types';
import { messagesAPI, usersAPI } from '../api';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import Avatar from '../components/Avatar';
import { HiPaperAirplane, HiOutlineMagnifyingGlass } from 'react-icons/hi2';

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString();
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeChat, setActiveChat] = useState<ConversationPreview | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { userId } = useAuthStore();

  useEffect(() => {
    loadConversations();
  }, []);

  // Real-time messages
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const msg = payload.new as any;
          // If message is in active chat
          if (
            activeChat &&
            ((msg.sender_id === activeChat.user_id && msg.receiver_id === userId) ||
              (msg.sender_id === userId && msg.receiver_id === activeChat.user_id))
          ) {
            setMessages((prev) => [
              ...prev,
              {
                message_id: msg.message_id,
                sender_id: msg.sender_id,
                receiver_id: msg.receiver_id,
                content: msg.content,
                is_read: msg.is_read,
                created_at: msg.created_at,
                sender_username: '',
                sender_display_name: '',
                sender_avatar_url: '',
              },
            ]);
          }
          // Refresh conversation list
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const res = await messagesAPI.getConversations();
      setConversations(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const openChat = async (convo: ConversationPreview) => {
    setActiveChat(convo);
    try {
      const res = await messagesAPI.getMessages(convo.user_id);
      setMessages(res.data);
    } catch {
      // ignore
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !activeChat || sending) return;
    setSending(true);
    try {
      await messagesAPI.sendMessage(activeChat.user_id, newMessage.trim());
      setNewMessage('');
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await usersAPI.searchUsers(searchQuery);
      setSearchResults(res.data);
    } catch {
      // ignore
    }
  };

  const startNewChat = (user: any) => {
    const convo: ConversationPreview = {
      user_id: user.user_id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      last_message: '',
      last_message_at: '',
      unread_count: 0,
    };
    setActiveChat(convo);
    setMessages([]);
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <div className="messages-layout">
      {/* Conversation List */}
      <div className="glass-card conversations-list">
        <div className="conversations-header">
          <h2>Messages</h2>
          <div className="search-input-wrapper" style={{ marginTop: 12 }}>
            <span className="search-icon"><HiOutlineMagnifyingGlass /></span>
            <input
              className="input"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch();
              }}
            />
          </div>
        </div>

        {searchResults.length > 0 && (
          <div style={{ borderBottom: '1px solid var(--border-color)' }}>
            {searchResults.map((user) => (
              <div
                key={user.user_id}
                className="conversation-item"
                onClick={() => startNewChat(user)}
              >
                <Avatar url={user.avatar_url} name={user.display_name} size="md" />
                <div className="conversation-info">
                  <div className="conversation-name">{user.display_name}</div>
                  <div className="conversation-preview">@{user.username}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="loading-spinner" />
        ) : conversations.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 16px' }}>
            <div className="empty-state-icon">💬</div>
            <div className="empty-state-text">No conversations yet.<br />Search for a user to start chatting!</div>
          </div>
        ) : (
          conversations.map((convo) => (
            <div
              key={convo.user_id}
              className={`conversation-item ${activeChat?.user_id === convo.user_id ? 'active' : ''}`}
              onClick={() => openChat(convo)}
            >
              <Avatar url={convo.avatar_url} name={convo.display_name} size="md" />
              <div className="conversation-info">
                <div className="conversation-name">{convo.display_name}</div>
                <div className="conversation-preview">{convo.last_message}</div>
              </div>
              <div className="conversation-meta">
                <span className="conversation-time">
                  {convo.last_message_at && timeAgo(convo.last_message_at)}
                </span>
                {convo.unread_count > 0 && (
                  <span className="conversation-unread">{convo.unread_count}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Chat Area */}
      <div className="glass-card chat-area">
        {activeChat ? (
          <>
            <div className="chat-header">
              <Avatar url={activeChat.avatar_url} name={activeChat.display_name} size="md" />
              <div>
                <div className="chat-header-name">{activeChat.display_name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                  @{activeChat.username}
                </div>
              </div>
            </div>

            <div className="chat-messages">
              {messages.map((msg) => (
                <div
                  key={msg.message_id}
                  className={`chat-message ${msg.sender_id === userId ? 'sent' : 'received'}`}
                >
                  <div>{msg.content}</div>
                  <div className="chat-message-time">{timeAgo(msg.created_at)}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <input
                className="input"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              <button
                className="btn btn-primary btn-icon"
                onClick={handleSend}
                disabled={sending || !newMessage.trim()}
              >
                <HiPaperAirplane size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ margin: 'auto' }}>
            <div className="empty-state-icon">💬</div>
            <div className="empty-state-title">Select a conversation</div>
            <div className="empty-state-text">Choose a chat from the sidebar or search for someone new</div>
          </div>
        )}
      </div>
    </div>
  );
}
