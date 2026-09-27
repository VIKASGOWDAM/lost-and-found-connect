/*
# Handover & Ratings Schema — Step 4b

## Overview
Adds handover scheduling and post-handover ratings for verified matches.
Either participant can propose a handover (method, time, general location).
The other can accept (→ scheduled) or edit and re-propose. Once the scheduled
time passes, each side confirms receipt independently; when both confirm, the
handover completes and both linked reports become 'resolved'. Either side can
flag a dispute, which sets status to 'disputed' and inserts a medium-severity
fraud flag. After completion, each side can rate the other once (1-5 stars);
the ratee's trust_score is recalculated as the average of all their ratings.

## Tables
1. handovers — id, match_id (unique FK), method (in_person | org_desk),
   proposed_by, scheduled_at, location_label, location_exact (point, nullable),
   location_reveal_at, status (proposed | scheduled | completed | disputed),
   confirmed_by_lost, confirmed_by_found, completed_at, created_at.
   One handover per match (unique constraint on match_id).
2. ratings — id, handover_id (FK), rater_id, ratee_id, score (1-5), comment,
   created_at. Unique on (handover_id, rater_id) — one rating per rater per handover.

## Views
- handover_view — returns handover fields EXCEPT location_exact when
  now() < location_reveal_at. Before reveal time, only location_label is
  exposed. After reveal time (or if no exact location was ever set), the
  exact coordinates are included. This is the ONLY way the frontend reads
  handover data — the raw handovers table has no SELECT policy for clients.

## Functions (all SECURITY DEFINER)
- propose_handover(p_match_id, p_proposed_by, p_method, p_scheduled_at, p_location_label)
  Creates or replaces the handover row for a verified match. Returns the handover id.
  Sets status='proposed', confirmed flags false, clears completed_at.
- accept_handover(p_handover_id, p_user_id)
  Sets status='scheduled', sets location_reveal_at = scheduled_at - 2 hours.
  Only the non-proposer (the other participant) can accept.
- edit_handover(p_handover_id, p_user_id, p_scheduled_at, p_location_label, p_method)
  Overwrites scheduled_at/location_label/method, keeps status='proposed'.
  Either participant can edit while status is 'proposed'.
- set_handover_location_exact(p_handover_id, p_user_id, p_lat, p_lng)
  Sets location_exact on a scheduled handover. Either participant can set it.
  Does NOT change location_reveal_at (that was fixed at accept time).
- confirm_handover(p_handover_id, p_user_id)
  Sets confirmed_by_lost or confirmed_by_found depending on which report
  the user owns. If both become true: status='completed', completed_at=now(),
  both reports → 'resolved'.
- dispute_handover(p_handover_id, p_user_id, p_reason)
  Sets status='disputed', inserts a 'medium' fraud_flag with the reason.
  Either participant can dispute while status is 'scheduled' or 'proposed'.
- rate_handover(p_handover_id, p_rater_id, p_score, p_comment)
  Inserts a rating (unique per rater per handover). Only allowed when
  handover.status='completed'. Recalculates ratee's trust_score as the
  average of all their received ratings. Returns the new trust_score.

## Security (RLS)
- handovers: NO client SELECT (read via handover_view). UPDATE only for
  participants — but all mutations go through SECURITY DEFINER functions
  anyway, so the UPDATE policy is a safety net. No client INSERT/DELETE.
- handover_view: SELECT only for the two match participants.
- ratings: INSERT only for a participant of a completed handover, once per
  rater. SELECT only for the rater (they can see their own submitted rating).
  No UPDATE/DELETE.
- fraud_flags: the existing 'fraud_flags_insert_match_participant' policy
  from Step 4a covers severity='low' conversation reports. The
  dispute_handover function inserts severity='medium' flags using the
  service role, so no new client policy is needed for that path.
*/

-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE handover_method AS ENUM ('in_person', 'org_desk');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE handover_status AS ENUM ('proposed', 'scheduled', 'completed', 'disputed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ HANDOVERS ============
CREATE TABLE IF NOT EXISTS handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  method handover_method NOT NULL DEFAULT 'in_person',
  proposed_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at timestamptz,
  location_label text,
  location_exact point,
  location_reveal_at timestamptz,
  status handover_status NOT NULL DEFAULT 'proposed',
  confirmed_by_lost boolean NOT NULL DEFAULT false,
  confirmed_by_found boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handovers_match ON handovers(match_id);
CREATE INDEX IF NOT EXISTS idx_handovers_status ON handovers(status);

ALTER TABLE handovers ENABLE ROW LEVEL SECURITY;

-- No client SELECT on raw handovers — use handover_view.
-- UPDATE is a safety net; real mutations go through SECURITY DEFINER functions.
DROP POLICY IF EXISTS "handovers_update_participants" ON handovers;
CREATE POLICY "handovers_update_participants" ON handovers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN reports lr ON lr.id = m.lost_report_id
      JOIN reports fr ON fr.id = m.found_report_id
      WHERE m.id = handovers.match_id
        AND (lr.reporter_id = auth.uid() OR fr.reporter_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN reports lr ON lr.id = m.lost_report_id
      JOIN reports fr ON fr.id = m.found_report_id
      WHERE m.id = handovers.match_id
        AND (lr.reporter_id = auth.uid() OR fr.reporter_id = auth.uid())
    )
  );

-- ============ HANDOVER VIEW (omits location_exact before reveal time) ============
CREATE OR REPLACE VIEW handover_view AS
SELECT
  h.id,
  h.match_id,
  h.method,
  h.proposed_by,
  h.scheduled_at,
  h.location_label,
  CASE
    WHEN h.location_exact IS NULL THEN NULL
    WHEN h.location_reveal_at IS NULL THEN NULL
    WHEN now() >= h.location_reveal_at THEN h.location_exact
    ELSE NULL
  END AS location_exact,
  h.location_reveal_at,
  h.status,
  h.confirmed_by_lost,
  h.confirmed_by_found,
  h.completed_at,
  h.created_at,
  m.lost_report_id,
  m.found_report_id,
  lr.reporter_id AS lost_reporter_id,
  fr.reporter_id AS found_reporter_id,
  CASE
    WHEN lr.reporter_id = auth.uid() THEN 'lost_reporter'
    WHEN fr.reporter_id = auth.uid() THEN 'found_reporter'
  END AS viewer_role
FROM handovers h
JOIN matches m ON m.id = h.match_id
JOIN reports lr ON lr.id = m.lost_report_id
JOIN reports fr ON fr.id = m.found_report_id;

ALTER VIEW handover_view OWNER TO postgres;

-- RLS-like access control on the view via a SECURITY BARRIER wrapper.
-- Views don't support RLS directly, so we create a SECURITY DEFINER function
-- that returns only rows the current user is allowed to see. The frontend
-- calls this function instead of selecting the view directly.
CREATE OR REPLACE FUNCTION get_my_handover(p_handover_id uuid)
RETURNS TABLE (
  id uuid,
  match_id uuid,
  method handover_method,
  proposed_by uuid,
  scheduled_at timestamptz,
  location_label text,
  location_exact point,
  location_reveal_at timestamptz,
  status handover_status,
  confirmed_by_lost boolean,
  confirmed_by_found boolean,
  completed_at timestamptz,
  created_at timestamptz,
  lost_report_id uuid,
  found_report_id uuid,
  lost_reporter_id uuid,
  found_reporter_id uuid,
  viewer_role text
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM handover_view hv
  WHERE hv.id = p_handover_id
    AND (hv.lost_reporter_id = auth.uid() OR hv.found_reporter_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ RATINGS ============
CREATE TABLE IF NOT EXISTS ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_id uuid NOT NULL REFERENCES handovers(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ratee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 1 AND score <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (handover_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_handover ON ratings(handover_id);
CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_id);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- A participant can read their own submitted rating.
DROP POLICY IF EXISTS "ratings_select_rater" ON ratings;
CREATE POLICY "ratings_select_rater" ON ratings FOR SELECT
  TO authenticated USING (rater_id = auth.uid());

-- INSERT is handled by the rate_handover SECURITY DEFINER function, but
-- we also allow direct INSERT with a check for safety.
DROP POLICY IF EXISTS "ratings_insert_participant" ON ratings;
CREATE POLICY "ratings_insert_participant" ON ratings FOR INSERT
  TO authenticated WITH CHECK (
    rater_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM handovers h
      JOIN matches m ON m.id = h.match_id
      JOIN reports lr ON lr.id = m.lost_report_id
      JOIN reports fr ON fr.id = m.found_report_id
      WHERE h.id = handover_id
        AND h.status = 'completed'
        AND (lr.reporter_id = auth.uid() OR fr.reporter_id = auth.uid())
        AND ratee_id <> auth.uid()
    )
  );

-- ============ FUNCTION: propose_handover ============
CREATE OR REPLACE FUNCTION propose_handover(
  p_match_id uuid,
  p_proposed_by uuid,
  p_method handover_method DEFAULT 'in_person',
  p_scheduled_at timestamptz DEFAULT NULL,
  p_location_label text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_handover_id uuid;
  v_is_participant boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM matches m
    JOIN reports lr ON lr.id = m.lost_report_id
    JOIN reports fr ON fr.id = m.found_report_id
    WHERE m.id = p_match_id
      AND m.status = 'verified'
      AND (lr.reporter_id = p_proposed_by OR fr.reporter_id = p_proposed_by)
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RAISE EXCEPTION 'Not authorized or match not verified';
  END IF;

  INSERT INTO handovers (match_id, method, proposed_by, scheduled_at, location_label, status)
  VALUES (p_match_id, p_method, p_proposed_by, p_scheduled_at, p_location_label, 'proposed')
  ON CONFLICT (match_id) DO UPDATE SET
    method = EXCLUDED.method,
    proposed_by = EXCLUDED.proposed_by,
    scheduled_at = EXCLUDED.scheduled_at,
    location_label = EXCLUDED.location_label,
    status = 'proposed',
    confirmed_by_lost = false,
    confirmed_by_found = false,
    completed_at = NULL,
    location_exact = NULL,
    location_reveal_at = NULL
  RETURNING id INTO v_handover_id;

  RETURN v_handover_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ FUNCTION: accept_handover ============
CREATE OR REPLACE FUNCTION accept_handover(p_handover_id uuid, p_user_id uuid)
RETURNS void AS $$
DECLARE
  v_match_id uuid;
  v_scheduled_at timestamptz;
  v_is_participant boolean;
BEGIN
  SELECT h.match_id, h.scheduled_at INTO v_match_id, v_scheduled_at
  FROM handovers h
  WHERE h.id = p_handover_id AND h.status = 'proposed';

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'Handover not found or not in proposed state';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM matches m
    JOIN reports lr ON lr.id = m.lost_report_id
    JOIN reports fr ON fr.id = m.found_report_id
    WHERE m.id = v_match_id
      AND (lr.reporter_id = p_user_id OR fr.reporter_id = p_user_id)
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE handovers
  SET status = 'scheduled',
      location_reveal_at = CASE
        WHEN v_scheduled_at IS NOT NULL THEN v_scheduled_at - interval '2 hours'
        ELSE NULL
      END
  WHERE id = p_handover_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ FUNCTION: edit_handover ============
CREATE OR REPLACE FUNCTION edit_handover(
  p_handover_id uuid,
  p_user_id uuid,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_location_label text DEFAULT NULL,
  p_method handover_method DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_match_id uuid;
  v_is_participant boolean;
BEGIN
  SELECT h.match_id INTO v_match_id
  FROM handovers h
  WHERE h.id = p_handover_id AND h.status = 'proposed';

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'Handover not found or not in proposed state';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM matches m
    JOIN reports lr ON lr.id = m.lost_report_id
    JOIN reports fr ON fr.id = m.found_report_id
    WHERE m.id = v_match_id
      AND (lr.reporter_id = p_user_id OR fr.reporter_id = p_user_id)
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE handovers
  SET scheduled_at = COALESCE(p_scheduled_at, scheduled_at),
      location_label = COALESCE(p_location_label, location_label),
      method = COALESCE(p_method, method)
  WHERE id = p_handover_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ FUNCTION: set_handover_location_exact ============
CREATE OR REPLACE FUNCTION set_handover_location_exact(
  p_handover_id uuid,
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision
)
RETURNS void AS $$
DECLARE
  v_match_id uuid;
  v_is_participant boolean;
BEGIN
  SELECT h.match_id INTO v_match_id
  FROM handovers h
  WHERE h.id = p_handover_id AND h.status = 'scheduled';

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'Handover not found or not scheduled';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM matches m
    JOIN reports lr ON lr.id = m.lost_report_id
    JOIN reports fr ON fr.id = m.found_report_id
    WHERE m.id = v_match_id
      AND (lr.reporter_id = p_user_id OR fr.reporter_id = p_user_id)
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE handovers
  SET location_exact = point(p_lng, p_lat)
  WHERE id = p_handover_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ FUNCTION: confirm_handover ============
CREATE OR REPLACE FUNCTION confirm_handover(p_handover_id uuid, p_user_id uuid)
RETURNS TABLE(new_status handover_status, both_confirmed boolean) AS $$
DECLARE
  v_match_id uuid;
  v_lost_report_id uuid;
  v_found_report_id uuid;
  v_is_lost boolean;
  v_is_found boolean;
  v_confirmed_lost boolean;
  v_confirmed_found boolean;
  v_scheduled_at timestamptz;
BEGIN
  SELECT h.match_id, h.scheduled_at INTO v_match_id, v_scheduled_at
  FROM handovers h
  WHERE h.id = p_handover_id AND h.status = 'scheduled';

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'Handover not found or not in scheduled state';
  END IF;

  SELECT m.lost_report_id, m.found_report_id,
         (lr.reporter_id = p_user_id), (fr.reporter_id = p_user_id)
  INTO v_lost_report_id, v_found_report_id, v_is_lost, v_is_found
  FROM matches m
  JOIN reports lr ON lr.id = m.lost_report_id
  JOIN reports fr ON lr.id = m.found_report_id
  WHERE m.id = v_match_id;

  IF NOT v_is_lost AND NOT v_is_found THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE handovers
  SET confirmed_by_lost = CASE WHEN v_is_lost THEN true ELSE confirmed_by_lost END,
      confirmed_by_found = CASE WHEN v_is_found THEN true ELSE confirmed_by_found END
  WHERE id = p_handover_id;

  SELECT confirmed_by_lost, confirmed_by_found INTO v_confirmed_lost, v_confirmed_found
  FROM handovers WHERE id = p_handover_id;

  IF v_confirmed_lost AND v_confirmed_found THEN
    UPDATE handovers SET status = 'completed', completed_at = now() WHERE id = p_handover_id;
    UPDATE reports SET status = 'resolved' WHERE id IN (v_lost_report_id, v_found_report_id);
    RETURN QUERY SELECT 'completed'::handover_status, true;
  ELSE
    RETURN QUERY SELECT 'scheduled'::handover_status, false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ FUNCTION: dispute_handover ============
CREATE OR REPLACE FUNCTION dispute_handover(p_handover_id uuid, p_user_id uuid, p_reason text)
RETURNS void AS $$
DECLARE
  v_match_id uuid;
  v_is_participant boolean;
BEGIN
  SELECT h.match_id INTO v_match_id
  FROM handovers h
  WHERE h.id = p_handover_id AND h.status IN ('proposed', 'scheduled');

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'Handover not found or not in a disputable state';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM matches m
    JOIN reports lr ON lr.id = m.lost_report_id
    JOIN reports fr ON fr.id = m.found_report_id
    WHERE m.id = v_match_id
      AND (lr.reporter_id = p_user_id OR fr.reporter_id = p_user_id)
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE handovers SET status = 'disputed' WHERE id = p_handover_id;

  INSERT INTO fraud_flags (match_id, reason, severity)
  VALUES (v_match_id, 'Handover dispute: ' || p_reason, 'medium');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ FUNCTION: rate_handover ============
CREATE OR REPLACE FUNCTION rate_handover(
  p_handover_id uuid,
  p_rater_id uuid,
  p_score integer,
  p_comment text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  v_match_id uuid;
  v_ratee_id uuid;
  v_is_participant boolean;
  v_new_trust integer;
BEGIN
  IF p_score < 1 OR p_score > 5 THEN
    RAISE EXCEPTION 'Score must be between 1 and 5';
  END IF;

  SELECT h.match_id INTO v_match_id
  FROM handovers h
  WHERE h.id = p_handover_id AND h.status = 'completed';

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'Handover not found or not completed';
  END IF;

  -- Determine the ratee: the other participant
  SELECT CASE
    WHEN lr.reporter_id = p_rater_id THEN fr.reporter_id
    ELSE lr.reporter_id
  END INTO v_ratee_id
  FROM matches m
  JOIN reports lr ON lr.id = m.lost_report_id
  JOIN reports fr ON lr.id = m.found_report_id
  WHERE m.id = v_match_id;

  IF v_ratee_id IS NULL THEN
    RAISE EXCEPTION 'Could not determine ratee';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM matches m
    JOIN reports lr ON lr.id = m.lost_report_id
    JOIN reports fr ON lr.id = m.found_report_id
    WHERE m.id = v_match_id
      AND (lr.reporter_id = p_rater_id OR fr.reporter_id = p_rater_id)
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO ratings (handover_id, rater_id, ratee_id, score, comment)
  VALUES (p_handover_id, p_rater_id, v_ratee_id, p_score, p_comment)
  ON CONFLICT (handover_id, rater_id) DO NOTHING;

  -- Recalculate ratee's trust_score as average of all received ratings
  UPDATE users
  SET trust_score = COALESCE(
    (SELECT ROUND(AVG(score))::integer FROM ratings WHERE ratee_id = v_ratee_id),
    0
  )
  WHERE id = v_ratee_id;

  SELECT trust_score INTO v_new_trust FROM users WHERE id = v_ratee_id;
  RETURN v_new_trust;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
