import { useState, useRef } from 'react';
import { postsAPI, mediaAPI } from '../api';
import { useAuthStore } from '../store/authStore';
import Avatar from './Avatar';
import { HiOutlinePhoto, HiXMark } from 'react-icons/hi2';

interface CreatePostProps {
  onPostCreated?: () => void;
}

export default function CreatePost({ onPostCreated }: CreatePostProps) {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'none'>('none');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { displayName, avatarUrl, userId } = useAuthStore();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (10 MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setMediaError('File too large (max 10 MB)');
      return;
    }

    setMediaError('');
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    setMediaType(file.type.startsWith('video') ? 'video' : 'image');
  };

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview('');
    setMediaType('none');
    setMediaError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!content.trim() || loading) return;
    setLoading(true);

    try {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      let finalMediaUrl = '';
      if (mediaFile && userId) {
        setUploadingMedia(true);
        try {
          finalMediaUrl = await mediaAPI.uploadPostMedia(mediaFile, userId);
        } catch (err) {
          setMediaError('Upload failed. Post will be created without media.');
        } finally {
          setUploadingMedia(false);
        }
      }

      await postsAPI.createPost({
        content: content.trim(),
        tags: tagList.length > 0 ? tagList : undefined,
        media_url: finalMediaUrl || undefined,
        media_type: finalMediaUrl ? mediaType : undefined,
      });

      setContent('');
      setTags('');
      clearMedia();
      onPostCreated?.();
    } catch {
      // ignore post creation errors — user can retry
    } finally {
      setLoading(false);
    }
  };

  const isSubmitting = loading || uploadingMedia;
  const submitLabel = uploadingMedia ? 'Uploading...' : loading ? 'Posting...' : 'Post';

  return (
    <div className="glass-card create-post">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

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

      {/* Media preview */}
      {mediaPreview && (
        <div style={{ position: 'relative', padding: '0 0 12px 52px' }}>
          {mediaType === 'image' ? (
            <img
              src={mediaPreview}
              alt="Media preview"
              style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 8, display: 'block' }}
            />
          ) : (
            <video
              src={mediaPreview}
              controls
              style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 8, display: 'block' }}
            />
          )}
          <button
            className="btn btn-ghost btn-icon btn-sm"
            style={{ position: 'absolute', top: 0, right: 8 }}
            onClick={clearMedia}
            type="button"
            title="Remove media"
          >
            <HiXMark size={16} />
          </button>
        </div>
      )}

      {mediaError && (
        <div style={{ padding: '0 0 8px 52px', color: 'var(--color-error, #ef4444)', fontSize: '0.8rem' }}>
          {mediaError}
        </div>
      )}

      <div className="create-post-bottom">
        <div className="create-post-actions">
          <button
            className="btn btn-ghost btn-icon btn-sm"
            title="Add photo or video"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <HiOutlinePhoto size={18} />
          </button>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSubmit}
          disabled={isSubmitting || !content.trim()}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
