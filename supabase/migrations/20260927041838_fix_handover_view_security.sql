/*
# Fix handover_view to filter by participant

The handover_view was returning ALL handovers to any authenticated user because
the view owner (postgres) bypasses RLS. This adds a WHERE clause so the view
only returns rows where the current user is a participant (lost or found
reporter). Also grants SELECT on the view to authenticated users only.
*/

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
JOIN reports fr ON lr.id = m.found_report_id
WHERE lr.reporter_id = auth.uid() OR fr.reporter_id = auth.uid();

ALTER VIEW handover_view OWNER TO postgres;

-- Grant SELECT only to authenticated (not anon — auth.uid() is NULL for anon anyway)
GRANT SELECT ON handover_view TO authenticated;
REVOKE SELECT ON handover_view FROM anon;

-- Drop the now-unused get_my_handover function
DROP FUNCTION IF EXISTS get_my_handover(uuid);
