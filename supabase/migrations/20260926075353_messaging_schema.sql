/*
# Messaging Schema — Step 4a

## Overview
Adds in-app messaging for verified matches. Both participants of a verified match
can send and read messages tied to that match_id. Also adds an INSERT policy to the
existing fraud_flags table so either participant can report a conversation.

## Tables
1. messages — id, match_id (FK matches), sender_id (FK users), body, sent_at,
   is_system_relayed (bool default false), read_at (nullable).
   Reserved for future automated system messages ("Handover scheduled for…").

## Security (RLS)
- messages: only the two users tied to the underlying match's lost/found reports
  can SELECT, INSERT, or UPDATE (mark-as-read), and only when match.status = 'verified'.
- fraud_flags: adds an INSERT policy allowing a match participant to flag their
  conversation (severity 'low', match_id set). Does not modify table structure.

## Helper function
- is_verified_match_participant(match_id, user_id) → boolean: returns true if the
  user owns either the lost or found report AND the match status is 'verified'.
  Used by all message policies to keep them DRY and consistent.
*/

-- ============ MESSAGES ============
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  is_system_relayed boolean NOT NULL DEFAULT false,
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id);
CREATE INDEX IF NOT EXISTS idx_messages_match_unread ON messages(match_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ============ HELPER: verified match participant check ============
CREATE OR REPLACE FUNCTION is_verified_match_participant(p_match_id uuid, p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM matches m
    JOIN reports lr ON lr.id = m.lost_report_id
    JOIN reports fr ON fr.id = m.found_report_id
    WHERE m.id = p_match_id
      AND m.status = 'verified'
      AND (lr.reporter_id = p_user_id OR fr.reporter_id = p_user_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ MESSAGES POLICIES ============
DROP POLICY IF EXISTS "messages_select_participants" ON messages;
CREATE POLICY "messages_select_participants" ON messages FOR SELECT
  TO authenticated USING (
    is_verified_match_participant(messages.match_id, auth.uid())
  );

DROP POLICY IF EXISTS "messages_insert_participants" ON messages;
CREATE POLICY "messages_insert_participants" ON messages FOR INSERT
  TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND is_verified_match_participant(messages.match_id, auth.uid())
  );

-- Allow a participant to mark messages they received (not sent) as read
DROP POLICY IF EXISTS "messages_update_participants" ON messages;
CREATE POLICY "messages_update_participants" ON messages FOR UPDATE
  TO authenticated
  USING (
    sender_id <> auth.uid()
    AND is_verified_match_participant(messages.match_id, auth.uid())
  )
  WITH CHECK (
    sender_id <> auth.uid()
    AND is_verified_match_participant(messages.match_id, auth.uid())
  );

-- ============ FRAUD FLAGS: INSERT POLICY FOR CONVERSATION REPORTS ============
-- Allows a match participant to flag their own conversation. Does not change
-- the table structure — only adds an INSERT policy.
DROP POLICY IF EXISTS "fraud_flags_insert_match_participant" ON fraud_flags;
CREATE POLICY "fraud_flags_insert_match_participant" ON fraud_flags FOR INSERT
  TO authenticated WITH CHECK (
    match_id IS NOT NULL
    AND severity = 'low'
    AND EXISTS (
      SELECT 1 FROM matches m
      JOIN reports lr ON lr.id = m.lost_report_id
      JOIN reports fr ON fr.id = m.found_report_id
      WHERE m.id = fraud_flags.match_id
        AND (lr.reporter_id = auth.uid() OR fr.reporter_id = auth.uid())
    )
  );
