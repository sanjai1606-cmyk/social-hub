import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { User, Post, ConnectionStatusResponse } from '../types';
import { usersAPI, postsAPI, connectionsAPI } from '../api';
import { useAuthStore } from '../store/authStore';
import Avatar from '../components/Avatar';
import PostCard from '../components/PostCard';
import {
  HiOutlineChatBubbleLeftRight,
  HiOutlineUserPlus,
  HiOutlineUserMinus,
  HiOutlineClock,
} from 'react-icons/hi2';

export default function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { userId: currentUserId } = useAuthStore();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [connStatus, setConnStatus] = useState<ConnectionStatusResponse | null>(null);
  const [connLoading, setConnLoading] = useState(false);

  const isOwnProfile = userId === currentUserId;

  useEffect(() => {
    if (userId) {
      loadProfile();
      loadPosts();
    }
  }, [userId]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await usersAPI.getUser(userId!);
      setUser(res.data);
      setEditBio(res.data.bio);
      setEditDisplayName(res.data.display_name);

      if (userId !== currentUserId) {
        const connRes = await connectionsAPI.getStatus(userId!);
        setConnStatus(connRes.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadPosts = async () => {
    try {
      const res = await postsAPI.getPosts(50, 0, userId);
      setPosts(res.data);
    } catch {
      // ignore
    }
  };

  const handleFollow = async () => {
    if (!user || followLoading) return;
    setFollowLoading(true);
    try {
      if (user.is_following) {
        await usersAPI.unfollow(user.user_id);
        setUser({ ...user, is_following: false, follower_count: user.follower_count - 1 });
      } else {
        await usersAPI.follow(user.user_id);
        setUser({ ...user, is_following: true, follower_count: user.follower_count + 1 });
      }
    } catch {
      // ignore
    } finally {
      setFollowLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!connStatus || connLoading) return;
    setConnLoading(true);
    try {
      if (connStatus.status === 'none') {
        await connectionsAPI.sendRequest(userId!);
        setConnStatus({ status: 'pending_sent', connection_id: null });
      } else if (connStatus.status === 'pending_sent' || connStatus.status === 'connected') {
        await connectionsAPI.remove(userId!);
        setConnStatus({ status: 'none', connection_id: null });
      } else if (connStatus.status === 'pending_received') {
        await connectionsAPI.accept(userId!);
        setConnStatus({ status: 'connected', connection_id: null });
      }
    } catch {
      // ignore
    } finally {
      setConnLoading(false);
    }
  };

  const handleMessage = () => {
    navigate('/messages', { state: { startChatWith: userId } });
  };

  const handleSaveProfile = async () => {
    try {
      await usersAPI.updateProfile({ display_name: editDisplayName, bio: editBio });
      setUser((prev) => prev ? { ...prev, display_name: editDisplayName, bio: editBio } : null);
      setEditMode(false);
    } catch {
      // ignore
    }
  };

  const getConnectLabel = () => {
    if (!connStatus) return 'Connect';
    switch (connStatus.status) {
      case 'connected': return 'Connected';
      case 'pending_sent': return 'Pending';
      case 'pending_received': return 'Accept';
      default: return 'Connect';
    }
  };

  const getConnectIcon = () => {
    if (!connStatus) return <HiOutlineUserPlus size={16} />;
    switch (connStatus.status) {
      case 'connected': return <HiOutlineUserMinus size={16} />;
      case 'pending_sent': return <HiOutlineClock size={16} />;
      default: return <HiOutlineUserPlus size={16} />;
    }
  };

  if (loading) return <div className="page-container"><div className="loading-spinner" /></div>;
  if (!user) return (
    <div className="page-container">
      <div className="glass-card empty-state"><div className="empty-state-title">User not found</div></div>
    </div>
  );

  return (
    <div className="page-container">
      <div className="glass-card animate-fade-in" style={{ overflow: 'hidden', marginBottom: 24 }}>
        {/* Cover */}
        <div className="profile-cover">
          {user.cover_url && <img src={user.cover_url} alt="Cover" />}
          <div className="profile-avatar-wrapper">
            <Avatar url={user.avatar_url || undefined} name={user.display_name} size="2xl" ring />
          </div>
        </div>

        {/* Info */}
        <div className="profile-info">
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div className="input-group">
                <label className="input-label">Display Name</label>
                <input
                  className="input"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Bio</label>
                <textarea
                  className="input"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={3}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={handleSaveProfile}>Save</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="profile-name">{user.display_name}</div>
              <div className="profile-username">@{user.username}</div>
              {user.bio && <div className="profile-bio">{user.bio}</div>}
            </>
          )}

          <div className="profile-stats">
            <div className="profile-stat">
              <span className="profile-stat-value">{user.post_count}</span>
              <span className="profile-stat-label">Posts</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">{user.follower_count}</span>
              <span className="profile-stat-label">Followers</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">{user.following_count}</span>
              <span className="profile-stat-label">Following</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">{user.connection_count}</span>
              <span className="profile-stat-label">Connections</span>
            </div>
          </div>

          <div className="profile-actions">
            {isOwnProfile ? (
              <button className="btn btn-secondary" onClick={() => setEditMode(!editMode)}>
                {editMode ? 'Cancel' : 'Edit Profile'}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className={`btn btn-sm ${user.is_following ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={handleFollow}
                  disabled={followLoading}
                >
                  {followLoading ? '...' : user.is_following ? 'Following' : 'Follow'}
                </button>

                <button
                  className={`btn btn-sm ${connStatus?.status === 'connected' ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={handleConnect}
                  disabled={connLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {connLoading ? '...' : (
                    <>
                      {getConnectIcon()}
                      {getConnectLabel()}
                    </>
                  )}
                </button>

                {connStatus?.status === 'connected' && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleMessage}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <HiOutlineChatBubbleLeftRight size={16} />
                    Message
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Posts */}
      <h2 className="page-title" style={{ fontSize: '1.2rem' }}>Posts</h2>
      {posts.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">📝</div>
          <div className="empty-state-text">No posts yet</div>
        </div>
      ) : (
        <div className="stagger-children">
          {posts.map((post) => (
            <PostCard key={post.post_id} post={post} onUpdate={loadPosts} />
          ))}
        </div>
      )}
    </div>
  );
}
