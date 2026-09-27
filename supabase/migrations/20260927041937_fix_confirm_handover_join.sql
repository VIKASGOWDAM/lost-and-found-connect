/*
# Fix confirm_handover JOIN bug

The confirm_handover function had a typo in the JOIN: it joined reports fr
ON lr.id instead of fr.id. This would cause the found_reporter_id check to
always match the lost reporter. Fixed to use fr.id.
*/

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
  JOIN reports fr ON fr.id = m.found_report_id
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
