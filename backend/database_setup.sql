-- =============================================================
-- Social Media Mini Platform — Supabase Database Setup
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- SECTION 1: TABLES
-- ─────────────────────────────────────────────────────────────

-- users: mirrors auth.users, auto-populated by trigger on registration
CREATE TABLE IF NOT EXISTS public.users (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio          TEXT NOT NULL DEFAULT '',
  avatar_url   TEXT NOT NULL DEFAULT '',
  cover_url    TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- posts
CREATE TABLE IF NOT EXISTS public.posts (
  post_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  media_url  TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'none' CHECK (media_type IN ('image', 'video', 'none')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- likes (unique per user+post)
CREATE TABLE IF NOT EXISTS public.likes (
  like_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.posts(post_id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

-- comments
CREATE TABLE IF NOT EXISTS public.comments (
  comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.posts(post_id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- follows (many-to-many self-join on users)
CREATE TABLE IF NOT EXISTS public.follows (
  follow_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

-- messages
-- FK constraint name 'messages_sender_id_fkey' is used in social.py PostgREST join alias
CREATE TABLE IF NOT EXISTS public.messages (
  message_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- notifications
-- FK constraint name 'notifications_actor_id_fkey' is used in social.py PostgREST join alias
CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  actor_id        UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'message')),
  content         TEXT NOT NULL,
  ref_id          UUID,   -- post_id for like/comment, follower_id for follow, message_id for message
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tags
CREATE TABLE IF NOT EXISTS public.tags (
  tag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name   TEXT NOT NULL UNIQUE
);

-- post_tags (many-to-many junction)
CREATE TABLE IF NOT EXISTS public.post_tags (
  post_id UUID NOT NULL REFERENCES public.posts(post_id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES public.tags(tag_id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);


-- ─────────────────────────────────────────────────────────────
-- SECTION 2: INDEXES
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_posts_user_id    ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_post_id    ON public.likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id    ON public.likes(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON public.follows(followee_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender  ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recv    ON public.messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_notifs_user_id   ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifs_unread    ON public.notifications(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_users_username   ON public.users(username);


-- ─────────────────────────────────────────────────────────────
-- SECTION 3: VIEW — v_post_summary
-- Used by: GET /posts and GET /posts/{post_id} in posts.py
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_post_summary AS
SELECT
  p.post_id,
  p.user_id,
  p.content,
  p.media_url,
  p.media_type,
  p.created_at,
  u.username,
  u.display_name,
  u.avatar_url,
  COUNT(DISTINCT l.like_id)    AS like_count,
  COUNT(DISTINCT c.comment_id) AS comment_count
FROM public.posts p
JOIN  public.users    u ON u.user_id = p.user_id
LEFT JOIN public.likes    l ON l.post_id = p.post_id
LEFT JOIN public.comments c ON c.post_id = p.post_id
GROUP BY p.post_id, u.user_id;


-- ─────────────────────────────────────────────────────────────
-- SECTION 4: RPC FUNCTION — get_user_feed
-- Used by: GET /posts/feed in posts.py
-- Returns posts from users the caller follows + their own posts
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_id UUID,
  p_limit   INT DEFAULT 20,
  p_offset  INT DEFAULT 0
)
RETURNS TABLE (
  post_id       UUID,
  user_id       UUID,
  content       TEXT,
  media_url     TEXT,
  media_type    TEXT,
  created_at    TIMESTAMPTZ,
  username      TEXT,
  display_name  TEXT,
  avatar_url    TEXT,
  like_count    BIGINT,
  comment_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.post_id,
    p.user_id,
    p.content,
    p.media_url,
    p.media_type,
    p.created_at,
    u.username,
    u.display_name,
    u.avatar_url,
    COUNT(DISTINCT l.like_id)    AS like_count,
    COUNT(DISTINCT c.comment_id) AS comment_count
  FROM public.posts p
  JOIN  public.users    u ON u.user_id = p.user_id
  LEFT JOIN public.likes    l ON l.post_id = p.post_id
  LEFT JOIN public.comments c ON c.post_id = p.post_id
  WHERE p.user_id IN (
    SELECT followee_id FROM public.follows WHERE follower_id = p_user_id
    UNION
    SELECT p_user_id  -- include caller's own posts
  )
  GROUP BY p.post_id, u.user_id
  ORDER BY p.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
$$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 5: TRIGGER — handle_new_user
-- Fires AFTER INSERT on auth.users (i.e., on every registration)
-- Reads username/display_name from raw_user_meta_data (set in auth.py)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (user_id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username',    split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name',
             NEW.raw_user_meta_data->>'username',
             split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────────
-- SECTION 6: NOTIFICATION TRIGGERS
-- Auto-populate notifications table on like / comment / follow / message
-- Used by: NotificationBell.tsx (subscribes to postgres_changes on notifications)
-- ─────────────────────────────────────────────────────────────

-- 6a. Like notification
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_post_owner UUID;
  v_actor_name TEXT;
BEGIN
  SELECT user_id INTO v_post_owner FROM public.posts WHERE post_id = NEW.post_id;
  -- Skip self-like or orphaned post
  IF v_post_owner IS NULL OR v_post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;
  SELECT display_name INTO v_actor_name FROM public.users WHERE user_id = NEW.user_id;
  INSERT INTO public.notifications (user_id, actor_id, type, content, ref_id)
  VALUES (v_post_owner, NEW.user_id, 'like', v_actor_name || ' liked your post', NEW.post_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_like ON public.likes;
CREATE TRIGGER trg_notify_like
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();


-- 6b. Comment notification
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_post_owner UUID;
  v_actor_name TEXT;
BEGIN
  SELECT user_id INTO v_post_owner FROM public.posts WHERE post_id = NEW.post_id;
  -- Skip self-comment or orphaned post
  IF v_post_owner IS NULL OR v_post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;
  SELECT display_name INTO v_actor_name FROM public.users WHERE user_id = NEW.user_id;
  INSERT INTO public.notifications (user_id, actor_id, type, content, ref_id)
  VALUES (v_post_owner, NEW.user_id, 'comment', v_actor_name || ' commented on your post', NEW.post_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_comment ON public.comments;
CREATE TRIGGER trg_notify_comment
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();


-- 6c. Follow notification
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_name TEXT;
BEGIN
  SELECT display_name INTO v_actor_name FROM public.users WHERE user_id = NEW.follower_id;
  INSERT INTO public.notifications (user_id, actor_id, type, content)
  VALUES (NEW.followee_id, NEW.follower_id, 'follow', v_actor_name || ' started following you');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_follow ON public.follows;
CREATE TRIGGER trg_notify_follow
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();


-- 6d. Message notification
CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_name TEXT;
BEGIN
  SELECT display_name INTO v_actor_name FROM public.users WHERE user_id = NEW.sender_id;
  INSERT INTO public.notifications (user_id, actor_id, type, content, ref_id)
  VALUES (NEW.receiver_id, NEW.sender_id, 'message', v_actor_name || ' sent you a message', NEW.message_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_message ON public.messages;
CREATE TRIGGER trg_notify_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();


-- ─────────────────────────────────────────────────────────────
-- SECTION 7: ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_tags      ENABLE ROW LEVEL SECURITY;

-- users: public read, owner write
CREATE POLICY "users_select_all" ON public.users FOR SELECT USING (true);
CREATE POLICY "users_insert_own" ON public.users FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (auth.uid() = user_id);

-- posts: public read, owner insert/delete
CREATE POLICY "posts_select_all" ON public.posts FOR SELECT USING (true);
CREATE POLICY "posts_insert_own" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_delete_own" ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- likes: public read, owner insert/delete
CREATE POLICY "likes_select_all" ON public.likes FOR SELECT USING (true);
CREATE POLICY "likes_insert_own" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete_own" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- comments: public read, owner insert/delete
CREATE POLICY "comments_select_all" ON public.comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_own" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete_own" ON public.comments FOR DELETE USING (auth.uid() = user_id);

-- follows: public read, follower insert/delete
CREATE POLICY "follows_select_all" ON public.follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_own" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows_delete_own" ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- messages: only sender or receiver can access
CREATE POLICY "messages_select" ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "messages_insert" ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "messages_update" ON public.messages FOR UPDATE
  USING (auth.uid() = receiver_id);  -- receiver marks as read

-- notifications: owner only (triggers insert as SECURITY DEFINER, no INSERT policy needed)
CREATE POLICY "notifs_select" ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "notifs_update" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- tags: public read, any authenticated user can insert
CREATE POLICY "tags_select_all" ON public.tags FOR SELECT USING (true);
CREATE POLICY "tags_insert_auth" ON public.tags FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- post_tags: public read, post owner can insert
CREATE POLICY "post_tags_select_all" ON public.post_tags FOR SELECT USING (true);
CREATE POLICY "post_tags_insert_auth" ON public.post_tags FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE post_id = post_tags.post_id AND user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────
-- SECTION 8: REALTIME SUBSCRIPTIONS
-- Enables Supabase Realtime for notifications and messages
-- Used by: NotificationBell.tsx and Messages.tsx
-- ─────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;


-- ─────────────────────────────────────────────────────────────
-- SECTION 9: STORAGE BUCKET
-- Creates a public bucket for post media (images/videos)
-- ─────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "post_media_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'post-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "post_media_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'post-media');

CREATE POLICY "post_media_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'post-media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );


-- =============================================================
-- DONE. Verify in Supabase Dashboard:
--   Table Editor    → 9 tables visible
--   Views           → v_post_summary
--   Functions       → get_user_feed
--   Triggers        → on_auth_user_created on auth.users
--                     trg_notify_* on likes/comments/follows/messages
--   Storage         → post-media bucket
-- =============================================================
