import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, Post } from '../types';
import { usersAPI, postsAPI } from '../api';
import Avatar from '../components/Avatar';
import PostCard from '../components/PostCard';
import { HiOutlineMagnifyingGlass } from 'react-icons/hi2';

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadTrending();
  }, []);

  const loadTrending = async () => {
    try {
      const res = await postsAPI.getPosts(20, 0);
      setTrendingPosts(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await usersAPI.searchUsers(query);
      setSearchResults(res.data);
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="page-container">
      <div className="explore-header animate-fade-in">
        <h1>Explore</h1>
        <p>Discover new people and trending posts</p>
      </div>

      {/* Search */}
      <div className="search-input-wrapper" style={{ marginBottom: 32 }}>
        <span className="search-icon"><HiOutlineMagnifyingGlass /></span>
        <input
          className="input"
          placeholder="Search for people..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ fontSize: '1rem', padding: '14px 14px 14px 44px' }}
        />
      </div>

      {/* Search Results */}
      {searchQuery && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>
            Search Results
          </h3>
          {searching ? (
            <div className="loading-spinner" />
          ) : searchResults.length === 0 ? (
            <div className="glass-card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              No users found for "{searchQuery}"
            </div>
          ) : (
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              {searchResults.map((user) => (
                <div
                  key={user.user_id}
                  className="user-card"
                  onClick={() => navigate(`/profile/${user.user_id}`)}
                >
                  <Avatar url={user.avatar_url || undefined} name={user.display_name} size="lg" />
                  <div className="user-card-info">
                    <div className="user-card-name">{user.display_name}</div>
                    <div className="user-card-username">@{user.username}</div>
                  </div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                    {user.follower_count} followers
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trending Posts */}
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16, color: 'var(--text-secondary)' }}>
        🔥 Recent Posts
      </h3>
      {loading ? (
        <div className="loading-spinner" />
      ) : trendingPosts.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">🌐</div>
          <div className="empty-state-text">No posts to explore yet</div>
        </div>
      ) : (
        <div className="stagger-children">
          {trendingPosts.map((post) => (
            <PostCard key={post.post_id} post={post} onUpdate={loadTrending} />
          ))}
        </div>
      )}
    </div>
  );
}
