import { useState, useEffect, useCallback } from 'react';
import type { Post } from '../types';
import { postsAPI } from '../api';
import PostCard from '../components/PostCard';
import CreatePost from '../components/CreatePost';

export default function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const loadPosts = useCallback(async (reset = false) => {
    try {
      const currentOffset = reset ? 0 : offset;
      const res = await postsAPI.getFeed(LIMIT, currentOffset);

      if (reset) {
        setPosts(res.data);
      } else {
        setPosts((prev) => [...prev, ...res.data]);
      }

      setHasMore(res.data.length === LIMIT);
      setOffset(currentOffset + res.data.length);
    } catch {
      // If feed fails (e.g. not following anyone), get all posts
      try {
        const res = await postsAPI.getPosts(LIMIT, 0);
        setPosts(res.data);
        setHasMore(res.data.length === LIMIT);
      } catch {
        // ignore
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [offset]);

  useEffect(() => {
    loadPosts(true);
  }, []);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    loadPosts();
  };

  // Infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + document.documentElement.scrollTop >=
        document.documentElement.offsetHeight - 300
      ) {
        handleLoadMore();
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadingMore, hasMore, offset]);

  const handleRefresh = () => {
    setLoading(true);
    setOffset(0);
    loadPosts(true);
  };

  return (
    <div className="page-container">
      <h1 className="page-title">
        <span className="page-title-gradient">Your Feed</span>
      </h1>

      <CreatePost onPostCreated={handleRefresh} />

      {loading ? (
        <div className="loading-spinner" />
      ) : posts.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-title">No posts yet</div>
          <div className="empty-state-text">
            Follow some people or create your first post!
          </div>
        </div>
      ) : (
        <div className="stagger-children">
          {posts.map((post) => (
            <PostCard key={post.post_id} post={post} onUpdate={handleRefresh} />
          ))}
        </div>
      )}

      {loadingMore && <div className="loading-spinner" />}
    </div>
  );
}
