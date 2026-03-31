import { useState, useEffect } from 'react';
import type { Comment } from '../types';
import { socialAPI } from '../api';
import Avatar from './Avatar';

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString();
}

interface CommentSectionProps {
  postId: string;
  onCommentAdded?: () => void;
}

export default function CommentSection({ postId, onCommentAdded }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadComments();
  }, [postId]);

  const loadComments = async () => {
    try {
      const res = await socialAPI.getComments(postId);
      setComments(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await socialAPI.addComment(postId, newComment.trim());
      setComments([...comments, res.data]);
      setNewComment('');
      onCommentAdded?.();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="comments-section">
      {loading ? (
        <div className="loading-spinner" style={{ margin: '16px auto' }} />
      ) : (
        <div className="stagger-children">
          {comments.map((c) => (
            <div key={c.comment_id} className="comment-item animate-fade-in">
              <Avatar url={c.avatar_url} name={c.display_name} size="sm" />
              <div className="comment-body">
                <span className="comment-author">{c.display_name}</span>
                <div className="comment-text">{c.content}</div>
                <div className="comment-time">{timeAgo(c.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="comment-input-row">
        <input
          className="input"
          placeholder="Write a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSubmit}
          disabled={submitting || !newComment.trim()}
        >
          {submitting ? '...' : 'Post'}
        </button>
      </div>
    </div>
  );
}
