import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Connection } from '../types';
import { connectionsAPI } from '../api';
import Avatar from '../components/Avatar';
import {
  HiOutlineUserGroup,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineChatBubbleLeftRight,
  HiOutlineUserPlus,
} from 'react-icons/hi2';

type Tab = 'connections' | 'received' | 'sent';

export default function ConnectionsPage() {
  const [tab, setTab] = useState<Tab>('connections');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [received, setReceived] = useState<Connection[]>([]);
  const [sent, setSent] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [connRes, recvRes, sentRes] = await Promise.all([
        connectionsAPI.getMyConnections(),
        connectionsAPI.getReceivedRequests(),
        connectionsAPI.getSentRequests(),
      ]);
      setConnections(connRes.data);
      setReceived(recvRes.data);
      setSent(sentRes.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (userId: string) => {
    setActionLoading(userId);
    try {
      await connectionsAPI.accept(userId);
      await loadAll();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId: string) => {
    setActionLoading(userId + '_reject');
    try {
      await connectionsAPI.reject(userId);
      await loadAll();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (userId: string) => {
    setActionLoading(userId + '_remove');
    try {
      await connectionsAPI.remove(userId);
      await loadAll();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSent = async (userId: string) => {
    setActionLoading(userId + '_cancel');
    try {
      await connectionsAPI.remove(userId);
      await loadAll();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleMessage = (userId: string) => {
    navigate('/messages', { state: { startChatWith: userId } });
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'connections', label: 'My Connections', count: connections.length },
    { key: 'received', label: 'Received', count: received.length },
    { key: 'sent', label: 'Sent', count: sent.length },
  ];

  const renderConnectionCard = (conn: Connection) => {
    const u = conn.user;
    const isActing = actionLoading === u.user_id || actionLoading?.startsWith(u.user_id);

    return (
      <div key={conn.connection_id} className="glass-card animate-fade-in-up" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div onClick={() => navigate(`/profile/${u.user_id}`)} style={{ cursor: 'pointer', flexShrink: 0 }}>
          <Avatar url={u.avatar_url || undefined} name={u.display_name} size="lg" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontWeight: 700, fontSize: '1rem', cursor: 'pointer', color: 'var(--text-primary)' }}
            onClick={() => navigate(`/profile/${u.user_id}`)}
          >
            {u.display_name}
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>@{u.username}</div>
          {u.bio && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.bio}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {conn.status === 'accepted' && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleMessage(u.user_id)}
                title="Send message"
              >
                <HiOutlineChatBubbleLeftRight size={16} />
                <span style={{ marginLeft: 4 }}>Message</span>
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleRemove(u.user_id)}
                disabled={isActing}
                title="Remove connection"
              >
                {isActing ? '...' : 'Remove'}
              </button>
            </>
          )}

          {conn.status === 'pending_received' && (
            <>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleAccept(u.user_id)}
                disabled={isActing}
                title="Accept"
              >
                <HiOutlineCheck size={16} />
                <span style={{ marginLeft: 4 }}>{isActing ? '...' : 'Accept'}</span>
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleReject(u.user_id)}
                disabled={isActing}
                title="Reject"
              >
                <HiOutlineXMark size={16} />
              </button>
            </>
          )}

          {conn.status === 'pending_sent' && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => handleCancelSent(u.user_id)}
              disabled={isActing}
            >
              {isActing ? '...' : 'Cancel Request'}
            </button>
          )}
        </div>
      </div>
    );
  };

  const currentList =
    tab === 'connections' ? connections : tab === 'received' ? received : sent;

  return (
    <div className="page-container">
      <div className="animate-fade-in" style={{ marginBottom: 24 }}>
        <h1 className="page-title">
          <span className="page-title-gradient">Connections</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Manage your professional network</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{
                marginLeft: 6,
                background: tab === t.key ? 'rgba(255,255,255,0.25)' : 'var(--accent-primary)',
                color: 'white',
                borderRadius: 999,
                padding: '1px 7px',
                fontSize: '0.75rem',
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-spinner" />
      ) : currentList.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">
            {tab === 'connections' ? '🤝' : tab === 'received' ? '📨' : '📤'}
          </div>
          <div className="empty-state-title">
            {tab === 'connections' ? 'No connections yet' : tab === 'received' ? 'No pending requests' : 'No sent requests'}
          </div>
          <div className="empty-state-text">
            {tab === 'connections'
              ? 'Go to Explore to find people to connect with'
              : tab === 'received'
              ? 'When someone sends you a connection request, it will appear here'
              : 'Your sent connection requests will appear here'}
          </div>
          {tab === 'connections' && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/explore')}>
              <HiOutlineUserPlus size={18} style={{ marginRight: 8 }} />
              Find People
            </button>
          )}
        </div>
      ) : (
        <div className="stagger-children">
          {currentList.map(renderConnectionCard)}
        </div>
      )}
    </div>
  );
}
