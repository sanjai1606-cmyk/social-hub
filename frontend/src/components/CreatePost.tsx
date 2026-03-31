import { useState } from 'react';
import { postsAPI } from '../api';
import { useAuthStore } from '../store/authStore';
import Avatar from './Avatar';
import { HiOutlinePhoto } from 'react-icons/hi2';

interface CreatePostProps {
  onPostCreated?: () => void;
}

export default function CreatePost({ onPostCreated }: CreatePostProps) {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const { displayName, avatarUrl } = useAuthStore();

  const handleSubmit = async () => {
    if (!content.trim() || loading) return;
    setLoading(true);
    try {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await postsAPI.createPost({
        content: content.trim(),
        tags: tagList.length > 0 ? tagList : undefined,
      });
      setContent('');
      setTags('');
      onPostCreated?.();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card create-post">
      <div className="create-post-top">
        <Avatar url={avatarUrl || undefined} name={displayName || 'U'} size="md" />
        <textarea
          placeholder="What's on your mind?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={2000}
        />
      </div>

      {content.trim() && (
        <div style={{ padding: '0 0 12px 52px' }}>
          <input
            className="input"
            placeholder="Tags (comma separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            style={{ fontSize: '0.85rem', padding: '8px 12px' }}
          />
        </div>
      )}

      <div className="create-post-bottom">
        <div className="create-post-actions">
          <button className="btn btn-ghost btn-icon btn-sm" title="Add photo">
            <HiOutlinePhoto size={18} />
          </button>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSubmit}
          disabled={loading || !content.trim()}
        >
          {loading ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  );
}
