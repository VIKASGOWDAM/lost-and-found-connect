/*
# Security fixes for handover functions and view

1. Revoke EXECUTE on all handover SECURITY DEFINER functions from anon role.
   These functions check auth.uid() internally but should not be callable by
   unauthenticated users at all.
2. Revoke EXECUTE from authenticated as well — the functions are called via
   supabase.rpc() which uses the anon key + user JWT, so authenticated EXECUTE
   is the correct grant. Actually, we keep authenticated EXECUTE and only
   revoke from anon.
3. Set search_path on all SECURITY DEFINER functions to 'public' to silence
   the mutable search_path warning.
4. The handover_view SECURITY DEFINER warning: views can't set search_path.
   The view filters by auth.uid() in its WHERE clause, so even though it runs
   with the owner's permissions, it only returns rows the current user is
   authorized to see. This is the same pattern as verification_session_view.
*/

-- Revoke EXECUTE from anon on all handover functions
REVOKE EXECUTE ON FUNCTION propose_handover(uuid, uuid, handover_method, timestamptz, text) FROM anon;
REVOKE EXECUTE ON FUNCTION accept_handover(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION edit_handover(uuid, uuid, timestamptz, text, handover_method) FROM anon;
REVOKE EXECUTE ON FUNCTION set_handover_location_exact(uuid, uuid, double precision, double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION confirm_handover(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION dispute_handover(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION rate_handover(uuid, uuid, integer, text) FROM anon;

-- Re-grant EXECUTE to authenticated (in case it was lost)
GRANT EXECUTE ON FUNCTION propose_handover(uuid, uuid, handover_method, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_handover(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION edit_handover(uuid, uuid, timestamptz, text, handover_method) TO authenticated;
GRANT EXECUTE ON FUNCTION set_handover_location_exact(uuid, uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_handover(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION dispute_handover(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION rate_handover(uuid, uuid, integer, text) TO authenticated;

-- Set search_path on all SECURITY DEFINER functions
ALTER FUNCTION propose_handover(uuid, uuid, handover_method, timestamptz, text) SET search_path = public;
ALTER FUNCTION accept_handover(uuid, uuid) SET search_path = public;
ALTER FUNCTION edit_handover(uuid, uuid, timestamptz, text, handover_method) SET search_path = public;
ALTER FUNCTION set_handover_location_exact(uuid, uuid, double precision, double precision) SET search_path = public;
ALTER FUNCTION confirm_handover(uuid, uuid) SET search_path = public;
ALTER FUNCTION dispute_handover(uuid, uuid, text) SET search_path = public;
ALTER FUNCTION rate_handover(uuid, uuid, integer, text) SET search_path = public;
