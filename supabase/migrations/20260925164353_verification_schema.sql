/*
# Verification Schema — Step 3

## Overview
Creates verification workflow tables: verification_sessions, verification_challenges,
fraud_flags. Adds 'verified' to match_status enum. Strict RLS — lost reporter can never
see challenge prompts, submitted answers, or correctness.

## Tables
1. verification_sessions — match_id (unique), status, initiated_by, attempt_count, max_attempts
2. verification_challenges — session_id, source_attribute_id, challenge_prompt, submitted_answer, is_correct, attempt_number
3. fraud_flags — report_id, user_id, match_id, reason, severity, resolved_by, resolution

## View
- verification_session_view — session info for both participants, omits challenge data

## Security
- verification_sessions: both match participants can SELECT
- verification_challenges: ONLY the finder (found_reporter) can SELECT — lost reporter blocked
- fraud_flags: no client access — service role only
*/

-- ============ ADD 'verified' TO match_status ============
DO $$ BEGIN
  ALTER TYPE match_status ADD VALUE 'verified';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('pending', 'in_progress', 'passed', 'failed', 'manual_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fraud_severity AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ VERIFICATION SESSIONS ============
CREATE TABLE IF NOT EXISTS verification_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  status verification_status NOT NULL DEFAULT 'pending',
  initiated_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE verification_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vsessions_select_participants" ON verification_sessions;
CREATE POLICY "vsessions_select_participants" ON verification_sessions FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN reports lr ON lr.id = m.lost_report_id
      JOIN reports fr ON fr.id = m.found_report_id
      WHERE m.id = verification_sessions.match_id
      AND (lr.reporter_id = auth.uid() OR fr.reporter_id = auth.uid())
    )
  );

-- ============ VERIFICATION CHALLENGES ============
CREATE TABLE IF NOT EXISTS verification_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES verification_sessions(id) ON DELETE CASCADE,
  source_attribute_id uuid NOT NULL REFERENCES report_private_attributes(id) ON DELETE CASCADE,
  challenge_prompt text NOT NULL,
  submitted_answer text,
  is_correct boolean,
  attempt_number integer NOT NULL DEFAULT 1,
  answered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_vchallenges_session ON verification_challenges(session_id);

ALTER TABLE verification_challenges ENABLE ROW LEVEL SECURITY;

-- Only the FINDER can read challenges — lost reporter blocked entirely
DROP POLICY IF EXISTS "vchallenges_select_finder_only" ON verification_challenges;
CREATE POLICY "vchallenges_select_finder_only" ON verification_challenges FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM verification_sessions vs
      JOIN matches m ON m.id = vs.match_id
      JOIN reports fr ON fr.id = m.found_report_id
      WHERE vs.id = verification_challenges.session_id
      AND fr.reporter_id = auth.uid()
    )
  );

-- ============ FRAUD FLAGS ============
CREATE TABLE IF NOT EXISTS fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES reports(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id uuid REFERENCES matches(id) ON DELETE CASCADE,
  reason text NOT NULL,
  severity fraud_severity NOT NULL DEFAULT 'low',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution text
);

ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;

-- No client policies — service role only

-- ============ VIEW: session info for both participants ============
CREATE OR REPLACE VIEW verification_session_view AS
SELECT
  vs.id AS session_id,
  vs.match_id,
  vs.status,
  vs.attempt_count,
  vs.max_attempts,
  vs.created_at,
  vs.completed_at,
  m.lost_report_id,
  m.found_report_id,
  lr.reporter_id AS lost_reporter_id,
  fr.reporter_id AS found_reporter_id,
  CASE
    WHEN lr.reporter_id = auth.uid() THEN 'lost_reporter'
    WHEN fr.reporter_id = auth.uid() THEN 'found_reporter'
  END AS viewer_role,
  (SELECT count(*) FROM verification_challenges vc WHERE vc.session_id = vs.id) AS total_challenges
FROM verification_sessions vs
JOIN matches m ON m.id = vs.match_id
JOIN reports lr ON lr.id = m.lost_report_id
JOIN reports fr ON fr.id = m.found_report_id;

-- ============ FUNCTION: generate_challenge_prompt ============
CREATE OR REPLACE FUNCTION generate_challenge_prompt(attr_key text)
RETURNS text AS $$
DECLARE
  lk text;
BEGIN
  lk := lower(attr_key);
  IF lk LIKE '%imei%' THEN
    RETURN 'What is the IMEI number of this phone?';
  ELSIF lk LIKE '%wallpaper%' OR lk LIKE '%lock screen%' THEN
    RETURN 'Describe what appears on the phone lock screen wallpaper.';
  ELSIF lk LIKE '%serial%' THEN
    RETURN 'What is the serial number of this item?';
  ELSIF lk LIKE '%document number%' THEN
    RETURN 'What is the document number shown on this document?';
  ELSIF lk LIKE '%name on document%' OR lk LIKE '%name on card%' THEN
    RETURN 'What name is printed on this item?';
  ELSIF lk LIKE '%last four%' OR lk LIKE '%last 4%' THEN
    RETURN 'What are the last four digits shown on this card?';
  ELSIF lk LIKE '%license plate%' THEN
    RETURN 'What is the license plate number of this vehicle?';
  ELSIF lk LIKE '%vin%' THEN
    RETURN 'What is the VIN number of this vehicle?';
  ELSIF lk LIKE '%student id%' THEN
    RETURN 'What is the student ID number on this item?';
  ELSIF lk LIKE '%engraving%' THEN
    RETURN 'Describe any engraving or inscription on this item.';
  ELSIF lk LIKE '%distinguishing%' OR lk LIKE '%sticker%' OR lk LIKE '%marks%' THEN
    RETURN 'Describe any distinguishing marks, stickers, or damage on this item.';
  ELSIF lk LIKE '%contents%' THEN
    RETURN 'Describe the contents of this item.';
  ELSIF lk LIKE '%name inside%' OR lk LIKE '%name written%' THEN
    RETURN 'What name is written inside this item?';
  ELSIF lk LIKE '%notes%' OR lk LIKE '%annotation%' THEN
    RETURN 'Describe any notes or annotations written in this item.';
  ELSIF lk LIKE '%estimated value%' THEN
    RETURN 'What is the estimated value of this item?';
  ELSE
    RETURN 'Please provide the following detail: ' || attr_key;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============ FUNCTION: start_verification ============
CREATE OR REPLACE FUNCTION start_verification(p_match_id uuid, p_initiated_by uuid)
RETURNS TABLE(session_id uuid, status verification_status, challenge_count int) AS $$
DECLARE
  v_lost_report_id uuid;
  v_session_id uuid;
  v_priv_id uuid;
  v_priv_key text;
  v_challenge_count int := 0;
  v_prompt text;
  v_priv_count int;
BEGIN
  SELECT lost_report_id INTO v_lost_report_id FROM matches WHERE id = p_match_id;
  IF v_lost_report_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'failed'::verification_status, 0;
    RETURN;
  END IF;

  SELECT count(*) INTO v_priv_count
  FROM report_private_attributes
  WHERE report_id = v_lost_report_id AND is_verification_challenge = true;

  IF v_priv_count < 2 THEN
    INSERT INTO verification_sessions (match_id, status, initiated_by)
    VALUES (p_match_id, 'manual_review', p_initiated_by)
    RETURNING id INTO v_session_id;

    INSERT INTO fraud_flags (match_id, reason, severity)
    VALUES (p_match_id, 'Verification sent to manual review: fewer than 2 private verification attributes on lost report', 'low');

    RETURN QUERY SELECT v_session_id, 'manual_review'::verification_status, 0;
    RETURN;
  END IF;

  INSERT INTO verification_sessions (match_id, status, initiated_by)
  VALUES (p_match_id, 'pending', p_initiated_by)
  RETURNING id INTO v_session_id;

  FOR v_priv_id, v_priv_key IN
    SELECT id, key FROM report_private_attributes
    WHERE report_id = v_lost_report_id AND is_verification_challenge = true
    LIMIT 3
  LOOP
    v_prompt := generate_challenge_prompt(v_priv_key);
    INSERT INTO verification_challenges (session_id, source_attribute_id, challenge_prompt, attempt_number)
    VALUES (v_session_id, v_priv_id, v_prompt, 1);
    v_challenge_count := v_challenge_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_session_id, 'pending'::verification_status, v_challenge_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ FUNCTION: evaluate_attempt ============
CREATE OR REPLACE FUNCTION evaluate_attempt(p_session_id uuid)
RETURNS TABLE(passed boolean, correct_count int, total_count int, attempt_number int) AS $$
DECLARE
  v_attempt int;
  v_correct int := 0;
  v_total int := 0;
  v_max_attempts int;
  v_match_id uuid;
BEGIN
  SELECT attempt_count, max_attempts, match_id INTO v_attempt, v_max_attempts, v_match_id
  FROM verification_sessions WHERE id = p_session_id;

  SELECT count(*), count(*) FILTER (WHERE is_correct = true) INTO v_total, v_correct
  FROM verification_challenges
  WHERE session_id = p_session_id AND attempt_number = v_attempt;

  IF v_correct >= 2 THEN
    UPDATE verification_sessions SET status = 'passed', completed_at = now() WHERE id = p_session_id;
    UPDATE matches SET status = 'verified' WHERE id = v_match_id;
    RETURN QUERY SELECT true, v_correct, v_total, v_attempt;
    RETURN;
  END IF;

  v_attempt := v_attempt + 1;
  UPDATE verification_sessions SET attempt_count = v_attempt WHERE id = p_session_id;

  IF v_attempt >= v_max_attempts THEN
    UPDATE verification_sessions SET status = 'failed', completed_at = now() WHERE id = p_session_id;
    UPDATE matches SET status = 'rejected' WHERE id = v_match_id;

    INSERT INTO fraud_flags (match_id, reason, severity)
    VALUES (v_match_id, 'Verification failed: finder could not answer enough challenges after max attempts', 'medium');
  ELSE
    INSERT INTO verification_challenges (session_id, source_attribute_id, challenge_prompt, attempt_number)
    SELECT p_session_id, source_attribute_id, challenge_prompt, v_attempt
    FROM verification_challenges
    WHERE session_id = p_session_id AND attempt_number = v_attempt - 1;
  END IF;

  RETURN QUERY SELECT false, v_correct, v_total, v_attempt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
