import { useState, useEffect, useRef } from 'react';
import { notificationsAPI } from '../api';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import type { Notification } from '../types';
import Avatar from './Avatar';
import { HiOutlineBell } from 'react-icons/hi2';

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString();
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { userId } = useAuthStore();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadUnreadCount();

    // Subscribe to real-time notifications
    if (userId) {
      const channel = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            setUnreadCount((c) => c + 1);
            if (open) loadNotifications();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [userId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadUnreadCount = async () => {
    try {
      const res = await notificationsAPI.getUnreadCount();
      setUnreadCount(res.data.count);
    } catch {
      // ignore
    }
  };

  const loadNotifications = async () => {
    try {
      const res = await notificationsAPI.getNotifications();
      setNotifications(res.data);
    } catch {
      // ignore
    }
  };

  const handleOpen = async () => {
    if (!open) {
      await loadNotifications();
    }
    setOpen(!open);
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // ignore
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'like': return '❤️';
      case 'comment': return '💬';
      case 'follow': return '👤';
      case 'message': return '✉️';
      default: return '🔔';
    }
  };

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button className="btn btn-ghost btn-icon" onClick={handleOpen}>
        <HiOutlineBell size={22} />
        {unreadCount > 0 && (
          <span className="notification-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown glass-card animate-scale-in">
          <div style={{
            padding: '16px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>Notifications</span>
            {unreadCount > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px' }}>
              <div className="empty-state-icon">🔔</div>
              <div className="empty-state-text">No notifications yet</div>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.notification_id}
                className={`notification-item ${!n.is_read ? 'unread' : ''}`}
              >
                <Avatar
                  url={n.actor_avatar_url || undefined}
                  name={n.actor_display_name || '?'}
                  size="sm"
                />
                <div className="notification-content">
                  <div className="notification-text">
                    {typeIcon(n.type)} {n.content}
                  </div>
                  <div className="notification-time">{timeAgo(n.created_at)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
