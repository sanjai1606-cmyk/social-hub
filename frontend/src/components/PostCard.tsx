import { useState } from 'react';
import type { Post } from '../types';
import { socialAPI } from '../api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { HiHeart, HiOutlineHeart, HiOutlineChatBubbleLeft, HiOutlineShare } from 'react-icons/hi2';
import Avatar from './Avatar';
import CommentSection from './CommentSection';

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return date.toLocaleDateString();
}

interface PostCardProps {
  post: Post;
  onUpdate?: () => void;
}

export default function PostCard({ post, onUpdate }: PostCardProps) {
  const [liked, setLiked] = useState(post.is_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const { userId } = useAuthStore();
  const navigate = useNavigate();

  const handleLike = async () => {
    try {
      if (liked) {
        await socialAPI.unlikePost(post.post_id);
        setLiked(false);
        setLikeCount((c) => c - 1);
      } else {
        await socialAPI.likePost(post.post_id);
        setLiked(true);
        setLikeCount((c) => c + 1);
        setLikeAnimating(true);
        setTimeout(() => setLikeAnimating(false), 400);
      }
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/post/${post.post_id}`);
    } catch {
      // ignore
    }
  };

  return (
    <div className="glass-card post-card animate-fade-in-up">
      <div className="post-header">
        <div
          onClick={() => navigate(`/profile/${post.user_id}`)}
          style={{ cursor: 'pointer' }}
        >
          <Avatar url={post.avatar_url} name={post.display_name} size="md" />
        </div>
        <div className="post-header-info">
          <div
            className="post-header-name"
            onClick={() => navigate(`/profile/${post.user_id}`)}
            style={{ cursor: 'pointer' }}
          >
            {post.display_name}
          </div>
          <div className="post-header-username">
            @{post.username} · {timeAgo(post.created_at)}
          </div>
        </div>
        {userId === post.user_id && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              if (confirm('Delete this post?')) {
                const { postsAPI } = await import('../api');
                await postsAPI.deletePost(post.post_id);
                onUpdate?.();
              }
            }}
            title="Delete post"
          >
            ✕
          </button>
        )}
      </div>

      <div className="post-content">{post.content}</div>

      {post.media_url && post.media_type === 'image' && (
        <div className="post-media">
          <img src={post.media_url} alt="Post media" loading="lazy" />
        </div>
      )}

      {post.media_url && post.media_type === 'video' && (
        <div className="post-media">
          <video src={post.media_url} controls />
        </div>
      )}

      {post.tags && post.tags.length > 0 && (
        <div className="post-tags">
          {post.tags.map((tag) => (
            <span key={tag} className="post-tag">#{tag}</span>
          ))}
        </div>
      )}

      <div className="post-actions">
        <button
          className={`post-action-btn ${liked ? 'liked' : ''} ${likeAnimating ? 'like-animate' : ''}`}
          onClick={handleLike}
        >
          {liked ? <HiHeart size={20} /> : <HiOutlineHeart size={20} />}
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
        <button
          className="post-action-btn"
          onClick={() => setShowComments(!showComments)}
        >
          <HiOutlineChatBubbleLeft size={20} />
          {commentCount > 0 && <span>{commentCount}</span>}
        </button>
        <button className="post-action-btn" onClick={handleShare}>
          <HiOutlineShare size={20} />
        </button>
      </div>

      {showComments && (
        <CommentSection
          postId={post.post_id}
          onCommentAdded={() => setCommentCount((c) => c + 1)}
        />
      )}
    </div>
  );
}
