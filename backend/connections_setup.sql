-- =============================================================
-- Social Hub — Connections Feature Migration
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- Run AFTER database_setup.sql
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- TABLE: connections (LinkedIn-style two-way connections)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.connections (
  connection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  addressee_id  UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_connections_requester ON public.connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_connections_addressee ON public.connections(addressee_id);
CREATE INDEX IF NOT EXISTS idx_connections_status    ON public.connections(status);

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

-- Both parties can see the connection row
CREATE POLICY "connections_select" ON public.connections FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Only the requester can create a connection request
CREATE POLICY "connections_insert" ON public.connections FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Only the addressee can update (accept/reject)
CREATE POLICY "connections_update" ON public.connections FOR UPDATE
  USING (auth.uid() = addressee_id);

-- Either party can delete (cancel request or remove connection)
CREATE POLICY "connections_delete" ON public.connections FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);


-- ─────────────────────────────────────────────────────────────
-- NOTIFICATION TRIGGERS for connections
-- ─────────────────────────────────────────────────────────────

-- Notify addressee when a connection request is sent
CREATE OR REPLACE FUNCTION public.notify_on_connection_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_name TEXT;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT display_name INTO v_name FROM public.users WHERE user_id = NEW.requester_id;
    INSERT INTO public.notifications (user_id, actor_id, type, content, ref_id)
    VALUES (NEW.addressee_id, NEW.requester_id, 'follow',
            v_name || ' sent you a connection request', NEW.requester_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_connection_request ON public.connections;
CREATE TRIGGER trg_notify_connection_request
  AFTER INSERT ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_connection_request();

-- Notify requester when their connection request is accepted
CREATE OR REPLACE FUNCTION public.notify_on_connection_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_name TEXT;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    SELECT display_name INTO v_name FROM public.users WHERE user_id = NEW.addressee_id;
    INSERT INTO public.notifications (user_id, actor_id, type, content, ref_id)
    VALUES (NEW.requester_id, NEW.addressee_id, 'follow',
            v_name || ' accepted your connection request', NEW.addressee_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_connection_accepted ON public.connections;
CREATE TRIGGER trg_notify_connection_accepted
  AFTER UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_connection_accepted();


-- ─────────────────────────────────────────────────────────────
-- REALTIME for connections (for live request updates)
-- ─────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.connections;


-- ─────────────────────────────────────────────────────────────
-- UPDATE notification type CHECK constraint to allow 'connection'
-- (Optional: the triggers above reuse 'follow' type)
-- ─────────────────────────────────────────────────────────────
-- Nothing needed — we reuse the 'follow' notification type.
-- The content field distinguishes "connection request" vs "started following".
