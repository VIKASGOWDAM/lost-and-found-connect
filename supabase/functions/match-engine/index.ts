import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const DATE_PROXIMITY_DAYS = 30;
const SCORE_THRESHOLD = 40;
const NOTIFY_THRESHOLD = 70;

interface ReportRow {
  id: string;
  type: "lost" | "found";
  reporter_id: string;
  category_id: string;
  status: string;
  location_general: string;
  date_occurred: string | null;
  created_at: string;
}

interface AttrRow {
  report_id: string;
  key: string;
  value: string | null;
}

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

function tokenize(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter((w) => w.length > 2));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function locationScore(locA: string, locB: string): number {
  const tokensA = tokenize(locA);
  const tokensB = tokenize(locB);
  return jaccardSimilarity(tokensA, tokensB);
}

function dateScore(dateA: string | null, dateB: string | null): number {
  if (!dateA || !dateB) return 0.5;
  const diffDays = Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays === 0) return 1.0;
  if (diffDays >= DATE_PROXIMITY_DAYS) return 0;
  return 1.0 - diffDays / DATE_PROXIMITY_DAYS;
}

function attrOverlapScore(
  attrsA: AttrRow[],
  attrsB: AttrRow[]
): number {
  const mapA = new Map<string, string>();
  for (const a of attrsA) {
    if (a.value) mapA.set(normalize(a.key), normalize(a.value));
  }
  const mapB = new Map<string, string>();
  for (const a of attrsB) {
    if (a.value) mapB.set(normalize(a.key), normalize(a.value));
  }

  let matched = 0;
  let comparable = 0;
  for (const [key, valA] of mapA) {
    const valB = mapB.get(key);
    if (valB !== undefined) {
      comparable++;
      if (valA === valB) {
        matched++;
      } else {
        const tokensA = tokenize(valA);
        const tokensB = tokenize(valB);
        const sim = jaccardSimilarity(tokensA, tokensB);
        if (sim > 0.5) matched += sim;
      }
    }
  }
  if (comparable === 0) return 0.5;
  return matched / comparable;
}

function computeScore(
  locationSim: number,
  dateSim: number,
  attrSim: number
): number {
  const wCategory = 25;
  const wLocation = 25;
  const wDate = 20;
  const wAttr = 30;
  const raw = wCategory + wLocation * locationSim + wDate * dateSim + wAttr * attrSim;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let triggerReportId: string | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      triggerReportId = body.report_id ?? null;
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      triggerReportId = url.searchParams.get("report_id");
    }

    // Fetch the trigger report if specified
    let triggerReport: ReportRow | null = null;
    if (triggerReportId) {
      const { data, error } = await supabase
        .from("reports")
        .select("id, type, reporter_id, category_id, status, location_general, date_occurred, created_at")
        .eq("id", triggerReportId)
        .maybeSingle();
      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Trigger report not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      triggerReport = data as ReportRow;
    }

    // Determine which reports to process
    let lostReports: ReportRow[] = [];
    let foundReports: ReportRow[] = [];

    if (triggerReport) {
      // Mode (a): triggered by a new report — compare it against all open reports of opposite type
      if (triggerReport.type === "lost") {
        lostReports = [triggerReport];
        const { data } = await supabase
          .from("reports")
          .select("id, type, reporter_id, category_id, status, location_general, date_occurred, created_at")
          .eq("type", "found")
          .eq("status", "open")
          .eq("category_id", triggerReport.category_id);
        foundReports = (data ?? []) as ReportRow[];
      } else {
        foundReports = [triggerReport];
        const { data } = await supabase
          .from("reports")
          .select("id, type, reporter_id, category_id, status, location_general, date_occurred, created_at")
          .eq("type", "lost")
          .eq("status", "open")
          .eq("category_id", triggerReport.category_id);
        lostReports = (data ?? []) as ReportRow[];
      }
    } else {
      // Mode (b): full reprocessing — all open lost vs all open found, same category
      const { data: lostData } = await supabase
        .from("reports")
        .select("id, type, reporter_id, category_id, status, location_general, date_occurred, created_at")
        .eq("type", "lost")
        .eq("status", "open");
      const { data: foundData } = await supabase
        .from("reports")
        .select("id, type, reporter_id, category_id, status, location_general, date_occurred, created_at")
        .eq("type", "found")
        .eq("status", "open");
      lostReports = (lostData ?? []) as ReportRow[];
      foundReports = (foundData ?? []) as ReportRow[];
    }

    // Fetch public attributes for all involved reports
    const allReportIds = new Set<string>();
    for (const r of [...lostReports, ...foundReports]) allReportIds.add(r.id);
    const reportIdList = Array.from(allReportIds);

    const { data: allAttrs } = await supabase
      .from("report_public_attributes")
      .select("report_id, key, value")
      .in("report_id", reportIdList.length > 0 ? reportIdList : ["00000000-0000-0000-0000-000000000000"]);

    const attrsByReport = new Map<string, AttrRow[]>();
    for (const a of (allAttrs ?? []) as AttrRow[]) {
      if (!attrsByReport.has(a.report_id)) attrsByReport.set(a.report_id, []);
      attrsByReport.get(a.report_id)!.push(a);
    }

    const results: { pair: string; score: number; notified: boolean; created: boolean }[] = [];

    for (const lost of lostReports) {
      for (const found of foundReports) {
        // Skip self-matches (same reporter)
        if (lost.reporter_id === found.reporter_id) continue;

        // Category already filtered in query, but double-check
        if (lost.category_id !== found.category_id) continue;

        // Date proximity check
        if (lost.date_occurred && found.date_occurred) {
          const diffDays = Math.abs(
            new Date(lost.date_occurred).getTime() - new Date(found.date_occurred).getTime()
          ) / (1000 * 60 * 60 * 24);
          if (diffDays > DATE_PROXIMITY_DAYS) continue;
        }

        const locScore = locationScore(lost.location_general, found.location_general);
        const dScore = dateScore(lost.date_occurred, found.date_occurred);
        const aScore = attrOverlapScore(
          attrsByReport.get(lost.id) ?? [],
          attrsByReport.get(found.id) ?? []
        );
        const score = computeScore(locScore, dScore, aScore);

        if (score < SCORE_THRESHOLD) continue;

        // Upsert match via SECURITY DEFINER function
        const { data: upsertResult, error: upsertError } = await supabase.rpc("upsert_match", {
          p_lost_report_id: lost.id,
          p_found_report_id: found.id,
          p_score: score,
          p_notify: true,
        });

        if (upsertError) {
          console.error("Upsert error:", upsertError);
          continue;
        }

        const result = (upsertResult as { match_id: string; was_created: boolean; final_score: number; should_notify: boolean }[])?.[0];
        if (!result) continue;

        // Create notifications for high-score matches
        if (result.should_notify) {
          const payload = {
            match_id: result.match_id,
            lost_report_id: lost.id,
            found_report_id: found.id,
            score: result.final_score,
          };

          await supabase.rpc("create_match_notification", {
            p_user_id: lost.reporter_id,
            p_type: "possible_match",
            p_payload: payload,
          });
          await supabase.rpc("create_match_notification", {
            p_user_id: found.reporter_id,
            p_type: "possible_match",
            p_payload: payload,
          });
        }

        results.push({
          pair: `${lost.id.substring(0, 8)}↔${found.id.substring(0, 8)}`,
          score: result.final_score,
          notified: result.should_notify,
          created: result.was_created,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        matches: results,
        scope: triggerReport ? "triggered" : "full",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Match engine error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
