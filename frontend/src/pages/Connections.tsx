import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Connection, User, ConnectionStatusResponse } from '../types';
import { connectionsAPI, usersAPI } from '../api';
import Avatar from '../components/Avatar';
import {
  HiOutlineUserGroup,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineChatBubbleLeftRight,
  HiOutlineUserPlus,
  HiOutlineUserMinus,
  HiOutlineClock,
  HiOutlineGlobeAlt,
} from 'react-icons/hi2';

type Tab = 'discover' | 'connections' | 'received' | 'sent';

export default function ConnectionsPage() {
  const [tab, setTab] = useState<Tab>('discover');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [received, setReceived] = useState<Connection[]>([]);
  const [sent, setSent] = useState<Connection[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [connStatuses, setConnStatuses] = useState<Record<string, ConnectionStatusResponse>>({});
  const [connLoading, setConnLoading] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [connRes, recvRes, sentRes, usersRes] = await Promise.all([
        connectionsAPI.getMyConnections(),
        connectionsAPI.getReceivedRequests(),
        connectionsAPI.getSentRequests(),
        usersAPI.getAllUsers(),
      ]);
      setConnections(connRes.data);
      setReceived(recvRes.data);
      setSent(sentRes.data);
      setAllUsers(usersRes.data);

      // Batch-fetch connection statuses for all users
      const statuses: Record<string, ConnectionStatusResponse> = {};
      await Promise.all(
        usersRes.data.map(async (u: User) => {
          try {
            const r = await connectionsAPI.getStatus(u.user_id);
            statuses[u.user_id] = r.data;
          } catch {
            statuses[u.user_id] = { status: 'none', connection_id: null };
          }
        })
      );
      setConnStatuses(statuses);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // ── Connection Actions ─────────────────────
  const handleConnect = async (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    if (connLoading[userId]) return;
    setConnLoading((prev) => ({ ...prev, [userId]: true }));
    try {
      const current = connStatuses[userId];
      if (!current || current.status === 'none') {
        await connectionsAPI.sendRequest(userId);
        setConnStatuses((prev) => ({ ...prev, [userId]: { status: 'pending_sent', connection_id: null } }));
      } else if (current.status === 'pending_sent' || current.status === 'connected') {
        await connectionsAPI.remove(userId);
        setConnStatuses((prev) => ({ ...prev, [userId]: { status: 'none', connection_id: null } }));
      } else if (current.status === 'pending_received') {
        await connectionsAPI.accept(userId);
        setConnStatuses((prev) => ({ ...prev, [userId]: { status: 'connected', connection_id: null } }));
      }
      // Refresh connection lists
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
      setConnLoading((prev) => ({ ...prev, [userId]: false }));
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

  // ── Discover helpers ─────────────────────
  const getConnectLabel = (userId: string) => {
    const s = connStatuses[userId]?.status;
    if (s === 'connected') return 'Connected';
    if (s === 'pending_sent') return 'Pending';
    if (s === 'pending_received') return 'Accept';
    return 'Connect';
  };

  const getConnectIcon = (userId: string) => {
    const s = connStatuses[userId]?.status;
    if (s === 'connected') return <HiOutlineUserMinus size={15} />;
    if (s === 'pending_sent') return <HiOutlineClock size={15} />;
    if (s === 'pending_received') return <HiOutlineCheck size={15} />;
    return <HiOutlineUserPlus size={15} />;
  };

  const getConnectBtnClass = (userId: string) => {
    const s = connStatuses[userId]?.status;
    if (s === 'connected') return 'btn btn-sm btn-secondary';
    if (s === 'pending_sent') return 'btn btn-sm btn-ghost';
    if (s === 'pending_received') return 'btn btn-sm btn-primary';
    return 'btn btn-sm btn-primary';
  };

  // ── Tabs config ────────────────────────────
  const tabs: { key: Tab; label: string; count: number; icon: React.ReactNode }[] = [
    { key: 'discover', label: 'Discover', count: allUsers.length, icon: <HiOutlineGlobeAlt size={16} /> },
    { key: 'connections', label: 'My Connections', count: connections.length, icon: <HiOutlineUserGroup size={16} /> },
    { key: 'received', label: 'Received', count: received.length, icon: <HiOutlineCheck size={16} /> },
    { key: 'sent', label: 'Sent', count: sent.length, icon: <HiOutlineClock size={16} /> },
  ];

  // ── Render: Discover Card ─────────────────
  const renderDiscoverCard = (user: User) => (
    <div
      key={user.user_id}
      className="glass-card animate-fade-in-up"
      style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
      onClick={() => navigate(`/profile/${user.user_id}`)}
    >
      <div style={{ flexShrink: 0 }}>
        <Avatar url={user.avatar_url || undefined} name={user.display_name} size="lg" />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
          {user.display_name}
        </div>
        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>@{user.username}</div>
        {user.bio && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.bio}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
          <span>{user.follower_count} followers</span>
          <span>{user.connection_count} connections</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        {connStatuses[user.user_id]?.status === 'connected' && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleMessage(user.user_id)}
            title="Send message"
          >
            <HiOutlineChatBubbleLeftRight size={16} />
            <span style={{ marginLeft: 4 }}>Message</span>
          </button>
        )}
        <button
          className={getConnectBtnClass(user.user_id)}
          onClick={(e) => handleConnect(e, user.user_id)}
          disabled={connLoading[user.user_id]}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          {connLoading[user.user_id] ? '...' : (
            <>
              {getConnectIcon(user.user_id)}
              {getConnectLabel(user.user_id)}
            </>
          )}
        </button>
      </div>
    </div>
  );

  // ── Render: Connection Card ────────────────
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

  // ── Current tab content ────────────────────
  const renderContent = () => {
    if (loading) return <div className="loading-spinner" />;

    if (tab === 'discover') {
      if (allUsers.length === 0) {
        return (
          <div className="glass-card empty-state">
            <div className="empty-state-icon">🌐</div>
            <div className="empty-state-title">No other users yet</div>
            <div className="empty-state-text">Invite your friends to join the platform!</div>
          </div>
        );
      }
      return (
        <div className="stagger-children">
          {allUsers.map(renderDiscoverCard)}
        </div>
      );
    }

    const list = tab === 'connections' ? connections : tab === 'received' ? received : sent;
    if (list.length === 0) {
      return (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">
            {tab === 'connections' ? '🤝' : tab === 'received' ? '📨' : '📤'}
          </div>
          <div className="empty-state-title">
            {tab === 'connections' ? 'No connections yet' : tab === 'received' ? 'No pending requests' : 'No sent requests'}
          </div>
          <div className="empty-state-text">
            {tab === 'connections'
              ? 'Discover people and send connection requests to build your network'
              : tab === 'received'
              ? 'When someone sends you a connection request, it will appear here'
              : 'Your sent connection requests will appear here'}
          </div>
          {tab === 'connections' && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setTab('discover')}>
              <HiOutlineUserPlus size={18} style={{ marginRight: 8 }} />
              Discover People
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="stagger-children">
        {list.map(renderConnectionCard)}
      </div>
    );
  };

  return (
    <div className="page-container">
      <div className="animate-fade-in" style={{ marginBottom: 24 }}>
        <h1 className="page-title">
          <span className="page-title-gradient">Connections</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Discover people and manage your network</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {t.icon}
            {t.label}
            {t.count > 0 && (
              <span style={{
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

      {renderContent()}
    </div>
  );
}
