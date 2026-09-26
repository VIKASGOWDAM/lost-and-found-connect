import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Verification workflow edge function: initiate sessions, evaluate answers, report problems.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const TRIGRAM_THRESHOLD = 0.6;

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

function trigramSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.length < 3 || nb.length < 3) {
    return na === nb ? 1.0 : 0;
  }

  const trigramsA = new Set<string>();
  for (let i = 0; i < na.length - 2; i++) trigramsA.add(na.substring(i, i + 3));
  const trigramsB = new Set<string>();
  for (let i = 0; i < nb.length - 2; i++) trigramsB.add(nb.substring(i, i + 3));

  let intersection = 0;
  for (const t of trigramsA) if (trigramsB.has(t)) intersection++;
  const union = trigramsA.size + trigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "initiate") {
      // Create verification session for a match
      const matchId = body.match_id as string;
      const initiatedBy = body.initiated_by as string;

      if (!matchId || !initiatedBy) {
        return new Response(
          JSON.stringify({ error: "match_id and initiated_by are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if session already exists
      const { data: existing } = await supabase
        .from("verification_sessions")
        .select("id, status")
        .eq("match_id", matchId)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ session_id: existing.id, status: existing.status, already_exists: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: result, error: rpcError } = await supabase.rpc("start_verification", {
        p_match_id: matchId,
        p_initiated_by: initiatedBy,
      });

      if (rpcError) {
        return new Response(
          JSON.stringify({ error: rpcError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const row = (result as { session_id: string; status: string; challenge_count: number }[])?.[0];
      if (!row) {
        return new Response(
          JSON.stringify({ error: "Failed to start verification" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Notify both users
      const { data: match } = await supabase
        .from("matches")
        .select("lost_report_id, found_report_id")
        .eq("id", matchId)
        .maybeSingle();

      if (match) {
        const { data: lostReport } = await supabase
          .from("reports").select("reporter_id").eq("id", match.lost_report_id).maybeSingle();
        const { data: foundReport } = await supabase
          .from("reports").select("reporter_id").eq("id", match.found_report_id).maybeSingle();

        if (lostReport) {
          await supabase.rpc("create_match_notification", {
            p_user_id: lostReport.reporter_id,
            p_type: "verification_started",
            p_payload: { session_id: row.session_id, match_id: matchId },
          });
        }
        if (foundReport) {
          await supabase.rpc("create_match_notification", {
            p_user_id: foundReport.reporter_id,
            p_type: "verification_started",
            p_payload: { session_id: row.session_id, match_id: matchId },
          });
        }
      }

      return new Response(
        JSON.stringify({ session_id: row.session_id, status: row.status, challenge_count: row.challenge_count }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "submit") {
      // Finder submits answers for the current attempt round
      const sessionId = body.session_id as string;
      const answers = body.answers as { challenge_id: string; answer: string }[];

      if (!sessionId || !answers || !Array.isArray(answers)) {
        return new Response(
          JSON.stringify({ error: "session_id and answers array are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get session
      const { data: session } = await supabase
        .from("verification_sessions")
        .select("id, match_id, attempt_count, max_attempts, status")
        .eq("id", sessionId)
        .maybeSingle();

      if (!session) {
        return new Response(
          JSON.stringify({ error: "Session not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (session.status === "passed" || session.status === "failed" || session.status === "manual_review") {
        return new Response(
          JSON.stringify({ error: "Session is already completed", status: session.status }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const currentAttempt = session.attempt_count > 0 ? session.attempt_count : 1;

      // If attempt_count is 0, set it to 1 (first attempt)
      if (session.attempt_count === 0) {
        await supabase.from("verification_sessions").update({ attempt_count: 1, status: "in_progress" }).eq("id", sessionId);
      } else if (session.status === "pending") {
        await supabase.from("verification_sessions").update({ status: "in_progress" }).eq("id", sessionId);
      }

      // For each submitted answer, look up the real value and evaluate
      for (const ans of answers) {
        const { data: challenge } = await supabase
          .from("verification_challenges")
          .select("id, source_attribute_id, attempt_number")
          .eq("id", ans.challenge_id)
          .eq("session_id", sessionId)
          .maybeSingle();

        if (!challenge) continue;

        // Get the real private attribute value
        const { data: privAttr } = await supabase
          .from("report_private_attributes")
          .select("value")
          .eq("id", challenge.source_attribute_id)
          .maybeSingle();

        const realValue = privAttr?.value ?? "";
        const submittedValue = ans.answer ?? "";
        const isCorrect = trigramSimilarity(submittedValue, realValue) >= TRIGRAM_THRESHOLD;

        await supabase
          .from("verification_challenges")
          .update({
            submitted_answer: submittedValue,
            is_correct: isCorrect,
            answered_at: new Date().toISOString(),
          })
          .eq("id", ans.challenge_id);
      }

      // Evaluate the attempt
      const { data: evalResult, error: evalError } = await supabase.rpc("evaluate_attempt", {
        p_session_id: sessionId,
      });

      if (evalError) {
        return new Response(
          JSON.stringify({ error: evalError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const evalRow = (evalResult as { passed: boolean; correct_count: number; total_count: number; attempt_number: number }[])?.[0];
      if (!evalRow) {
        return new Response(
          JSON.stringify({ error: "Evaluation failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Notify both users of the result
      const { data: match } = await supabase
        .from("matches")
        .select("lost_report_id, found_report_id")
        .eq("id", session.match_id)
        .maybeSingle();

      if (match) {
        const { data: lostReport } = await supabase
          .from("reports").select("reporter_id").eq("id", match.lost_report_id).maybeSingle();
        const { data: foundReport } = await supabase
          .from("reports").select("reporter_id").eq("id", match.found_report_id).maybeSingle();

        const notifType = evalRow.passed ? "verification_passed" : "verification_attempt_failed";
        const payload = {
          session_id: sessionId,
          match_id: session.match_id,
          passed: evalRow.passed,
          attempt: evalRow.attempt_number,
        };

        if (lostReport) {
          await supabase.rpc("create_match_notification", {
            p_user_id: lostReport.reporter_id,
            p_type: notifType,
            p_payload: payload,
          });
        }
        if (foundReport) {
          await supabase.rpc("create_match_notification", {
            p_user_id: foundReport.reporter_id,
            p_type: notifType,
            p_payload: payload,
          });
        }
      }

      return new Response(
        JSON.stringify({
          passed: evalRow.passed,
          correct_count: evalRow.correct_count,
          total_count: evalRow.total_count,
          attempt_number: evalRow.attempt_number,
          session_ended: evalRow.passed || evalRow.attempt_number >= session.max_attempts,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "report_problem") {
      // User reports a problem with a verification
      const matchId = body.match_id as string;
      const userId = body.user_id as string;
      const reason = body.reason as string;

      if (!matchId || !userId || !reason) {
        return new Response(
          JSON.stringify({ error: "match_id, user_id, and reason are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: flagError } = await supabase.from("fraud_flags").insert({
        match_id: matchId,
        user_id: userId,
        reason: reason,
        severity: "low",
      });

      if (flagError) {
        return new Response(
          JSON.stringify({ error: flagError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use 'initiate', 'submit', or 'report_problem'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Verify-match error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
