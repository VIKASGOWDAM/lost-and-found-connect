/*
# Matches and Notifications Tables

## Overview
Creates the matches table for pairing lost reports with found reports, and a
notifications table for in-app match notifications. Both have strict RLS so users
only see matches they're a party to and their own notifications.

## Tables
1. matches — id, lost_report_id, found_report_id, match_score (0-100), status
   (suggested, confirmed_pending_verification, rejected, expired), created_at, updated_at.
   Unique constraint on (lost_report_id, found_report_id) prevents duplicate pairs.
2. notifications — id, user_id, type, payload (jsonb), read_at, created_at.

## Security
- matches: users can read/insert/update only rows where they own the lost or found report.
  No delete from client. No anon access.
- notifications: users can read/update their own notifications only. No anon access.
- A SECURITY DEFINER function updates report status to 'matched' when a high-score
  match is created, so the client doesn't need elevated privileges to update report status.
*/

DO $$ BEGIN
  CREATE TYPE match_status AS ENUM ('suggested', 'confirmed_pending_verification', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ MATCHES ============
CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lost_report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  found_report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  match_score numeric(5,2) NOT NULL CHECK (match_score >= 0 AND match_score <= 100),
  status match_status NOT NULL DEFAULT 'suggested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_pair
  ON matches (lost_report_id, found_report_id);

CREATE INDEX IF NOT EXISTS idx_matches_lost ON matches(lost_report_id);
CREATE INDEX IF NOT EXISTS idx_matches_found ON matches(found_report_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Users can read matches where they own either the lost or found report
DROP POLICY IF EXISTS "matches_select_own" ON matches;
CREATE POLICY "matches_select_own" ON matches FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = matches.lost_report_id AND r.reporter_id = auth.uid())
    OR EXISTS (SELECT 1 FROM reports r WHERE r.id = matches.found_report_id AND r.reporter_id = auth.uid())
  );

-- Users can update match status (confirm/reject) only for matches they're a party to
DROP POLICY IF EXISTS "matches_update_own" ON matches;
CREATE POLICY "matches_update_own" ON matches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = matches.lost_report_id AND r.reporter_id = auth.uid())
    OR EXISTS (SELECT 1 FROM reports r WHERE r.id = matches.found_report_id AND r.reporter_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM reports r WHERE r.id = matches.lost_report_id AND r.reporter_id = auth.uid())
    OR EXISTS (SELECT 1 FROM reports r WHERE r.id = matches.found_report_id AND r.reporter_id = auth.uid())
  );

-- No client INSERT or DELETE on matches — only the edge function (service role) creates them

-- ============ NOTIFICATIONS ============
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- No client INSERT or DELETE — only edge function creates notifications

-- ============ UPDATED_AT TRIGGER FOR MATCHES ============
DROP TRIGGER IF EXISTS trg_matches_updated_at ON matches;
CREATE TRIGGER trg_matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============ FUNCTION: mark_report_matched ============
-- Called when a high-score match is created. Sets report status to 'matched'
-- if it's currently 'open'. SECURITY DEFINER so the edge function can use it
-- without needing direct UPDATE privileges on reports.
CREATE OR REPLACE FUNCTION mark_report_matched(report_uuid uuid)
RETURNS void AS $$
BEGIN
  UPDATE reports SET status = 'matched' WHERE id = report_uuid AND status = 'open';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ FUNCTION: upsert_match ============
-- Inserts or updates a match row. If the pair already exists, updates the score
-- if the new score is higher. Returns the match row. SECURITY DEFINER so the
-- edge function (service role) can call it.
CREATE OR REPLACE FUNCTION upsert_match(
  p_lost_report_id uuid,
  p_found_report_id uuid,
  p_score numeric,
  p_notify boolean DEFAULT true
)
RETURNS TABLE (
  match_id uuid,
  was_created boolean,
  final_score numeric,
  should_notify boolean
) AS $$
DECLARE
  existing_id uuid;
  existing_score numeric;
  existing_status match_status;
  v_match_id uuid;
  v_created boolean := false;
  v_final_score numeric;
  v_should_notify boolean := false;
BEGIN
  SELECT id, match_score, status INTO existing_id, existing_score, existing_status
  FROM matches
  WHERE lost_report_id = p_lost_report_id AND found_report_id = p_found_report_id;

  IF existing_id IS NULL THEN
    INSERT INTO matches (lost_report_id, found_report_id, match_score, status)
    VALUES (p_lost_report_id, p_found_report_id, p_score, 'suggested')
    RETURNING id, match_score INTO v_match_id, v_final_score;
    v_created := true;
  ELSE
    -- Only update if new score is higher and status is still 'suggested'
    IF p_score > existing_score AND existing_status = 'suggested' THEN
      UPDATE matches SET match_score = p_score WHERE id = existing_id;
      v_final_score := p_score;
    ELSE
      v_final_score := existing_score;
    END IF;
    v_match_id := existing_id;
  END IF;

  -- Notify on high scores (>= 70)
  IF p_notify AND p_score >= 70 THEN
    v_should_notify := true;
    -- Mark both reports as matched
    PERFORM mark_report_matched(p_lost_report_id);
    PERFORM mark_report_matched(p_found_report_id);
  END IF;

  RETURN QUERY SELECT v_match_id, v_created, v_final_score, v_should_notify;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ FUNCTION: create_match_notification ============
-- Creates a notification for a user about a possible match. SECURITY DEFINER.
CREATE OR REPLACE FUNCTION create_match_notification(
  p_user_id uuid,
  p_type text,
  p_payload jsonb
)
RETURNS void AS $$
BEGIN
  INSERT INTO notifications (user_id, type, payload)
  VALUES (p_user_id, p_type, p_payload);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
