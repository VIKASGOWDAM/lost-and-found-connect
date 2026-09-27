import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import type { Report, ReportPublicAttribute, ReportPrivateAttribute, ReportMedia, Match, Category } from '@/lib/types';
import { getCategoryIcon } from '@/lib/categoryIcons';
import { StatusBadge, TypeBadge } from '@/components/Badges';
import { ChevronLeft, ChevronRight, MapPin, Calendar, Eye, Lock, Package, Plus, Sparkles, Check, X, ShieldCheck, MessageSquare } from 'lucide-react';
import { HandoverPanel } from '@/components/HandoverPanel';

interface MatchWithOtherReport extends Match {
  otherReport: Report;
  otherPubAttrs: ReportPublicAttribute[];
  otherMedia: ReportMedia[];
}

export function MyReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const { navigate } = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState<{
    pubAttrs: ReportPublicAttribute[];
    privAttrs: ReportPrivateAttribute[];
    media: ReportMedia[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [matchesByReport, setMatchesByReport] = useState<Record<string, MatchWithOtherReport[]>>({});
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [showMatchesFor, setShowMatchesFor] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [verifyingMatchId, setVerifyingMatchId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('reports')
      .select(`
        id, type, reporter_id, category_id, status, location_general, date_occurred, created_at, updated_at,
        category:categories(id, name, parent_id)
      `)
      .eq('reporter_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) setReports(data as unknown as Report[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      if (!authLoading) navigate('/login');
      return;
    }
    loadReports();
  }, [user, authLoading, navigate, loadReports]);

  const loadMatches = useCallback(async (reportId: string) => {
    if (!user) return;
    setMatchesLoading(true);
    setShowMatchesFor(reportId);

    // Get matches where this report is either lost or found, status not rejected
    const { data: lostMatches, error: lostErr } = await supabase
      .from('matches')
      .select('*')
      .eq('lost_report_id', reportId)
      .neq('status', 'rejected')
      .order('match_score', { ascending: false });

    const { data: foundMatches, error: foundErr } = await supabase
      .from('matches')
      .select('*')
      .eq('found_report_id', reportId)
      .neq('status', 'rejected')
      .order('match_score', { ascending: false });

    if (lostErr || foundErr) {
      setMatchesLoading(false);
      return;
    }

    const allMatches = [...(lostMatches ?? []), ...(foundMatches ?? [])] as Match[];

    // For each match, fetch the OTHER report's public data
    const enriched: MatchWithOtherReport[] = [];
    for (const m of allMatches) {
      const otherId = m.lost_report_id === reportId ? m.found_report_id : m.lost_report_id;

      const { data: otherReport } = await supabase
        .from('reports')
        .select(`
          id, type, reporter_id, category_id, status, location_general, date_occurred, created_at, updated_at,
          category:categories(id, name, parent_id)
        `)
        .eq('id', otherId)
        .maybeSingle();

      if (!otherReport) continue;

      const { data: pubAttrs } = await supabase
        .from('report_public_attributes')
        .select('id, report_id, key, value')
        .eq('report_id', otherId);

      const { data: media } = await supabase
        .from('report_media')
        .select('id, report_id, url, visibility, media_type')
        .eq('report_id', otherId)
        .eq('visibility', 'public');

      enriched.push({
        ...m,
        otherReport: otherReport as unknown as Report,
        otherPubAttrs: (pubAttrs ?? []) as ReportPublicAttribute[],
        otherMedia: (media ?? []) as ReportMedia[],
      });
    }

    enriched.sort((a, b) => b.match_score - a.match_score);
    setMatchesByReport((prev) => ({ ...prev, [reportId]: enriched }));
    setMatchesLoading(false);
  }, [user]);

  const loadDetails = async (reportId: string) => {
    if (expandedId === reportId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(reportId);
    setDetailLoading(true);
    setReportDetails(null);

    const [{ data: pub }, { data: priv }, { data: med }] = await Promise.all([
      supabase.from('report_public_attributes').select('id, report_id, key, value').eq('report_id', reportId),
      supabase.from('report_private_attributes').select('id, report_id, key, value, is_verification_challenge').eq('report_id', reportId),
      supabase.from('report_media').select('id, report_id, url, visibility, media_type').eq('report_id', reportId),
    ]);

    setReportDetails({
      pubAttrs: (pub ?? []) as ReportPublicAttribute[],
      privAttrs: (priv ?? []) as ReportPrivateAttribute[],
      media: (med ?? []) as ReportMedia[],
    });
    setDetailLoading(false);
  };

  const handleMatchAction = async (matchId: string, action: 'confirm' | 'reject') => {
    setActionLoading(matchId);
    const newStatus = action === 'confirm' ? 'confirmed_pending_verification' : 'rejected';
    await supabase.from('matches').update({ status: newStatus }).eq('id', matchId);

    if (action === 'confirm') {
      // Call the verify-match edge function to create a verification session
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-match`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            action: 'initiate',
            match_id: matchId,
            initiated_by: user?.id,
          }),
        });

        if (!response.ok) throw new Error('Failed to start verification');
        const result = await response.json();

        if (result.session_id) {
          navigate(`/verify/${result.session_id}`);
          return;
        }
      } catch {
        // If initiation fails, still mark as confirmed — user can retry from matches
      }
    }

    // Update local state — remove confirmed/rejected matches from the list
    setMatchesByReport((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].filter((m) => m.id !== matchId);
      }
      return updated;
    });
    setActionLoading(null);
  };

  if (authLoading || (!user && authLoading)) return null;
  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-sky-600" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
            <p className="text-sm text-gray-600 mt-1">Your lost and found reports, with full access to private details.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/report/lost')} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors">
              <Plus className="h-4 w-4" /> Lost
            </button>
            <button onClick={() => navigate('/report/found')} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 transition-colors">
              <Plus className="h-4 w-4" /> Found
            </button>
          </div>
        </div>

        {reports.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No reports yet</p>
            <p className="text-sm text-gray-400 mt-1 mb-4">Create your first lost or found report to get started.</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => navigate('/report/lost')} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700">Report Lost Item</button>
              <button onClick={() => navigate('/report/found')} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700">Report Found Item</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => {
              const Icon = getCategoryIcon(report.category?.name ?? 'Other');
              const isExpanded = expandedId === report.id;
              const isShowingMatches = showMatchesFor === report.id;
              const reportMatches = matchesByReport[report.id] ?? [];
              return (
                <div key={report.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <button
                    onClick={() => loadDetails(report.id)}
                    className="w-full text-left p-5 hover:bg-gray-50/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-500">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-gray-900">{report.category?.name ?? 'Unknown'}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <TypeBadge type={report.type} />
                            <StatusBadge status={report.status} />
                          </div>
                        </div>
                      </div>
                      {isExpanded ? <ChevronLeft className="h-5 w-5 text-gray-400 rotate-90" /> : <ChevronRight className="h-5 w-5 text-gray-400 -rotate-90" />}
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{report.location_general}</span>
                      {report.date_occurred && (
                        <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{new Date(report.date_occurred).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 p-5 bg-gray-50/30">
                      {detailLoading ? (
                        <div className="text-center py-6">
                          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-sky-600" />
                        </div>
                      ) : reportDetails ? (
                        <div className="space-y-5">
                          {/* Public attrs */}
                          {reportDetails.pubAttrs.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Eye className="h-4 w-4 text-emerald-600" />
                                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Public attributes</h3>
                              </div>
                              <dl className="grid gap-2 sm:grid-cols-2">
                                {reportDetails.pubAttrs.map((a) => (
                                  <div key={a.id} className="rounded-lg bg-white px-3 py-2 border border-gray-100">
                                    <dt className="text-xs text-gray-500">{a.key}</dt>
                                    <dd className="text-sm font-medium text-gray-900">{a.value || '—'}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          )}

                          {/* Private attrs */}
                          {reportDetails.privAttrs.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Lock className="h-4 w-4 text-sky-600" />
                                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Private attributes</h3>
                              </div>
                              <dl className="grid gap-2 sm:grid-cols-2">
                                {reportDetails.privAttrs.map((a) => (
                                  <div key={a.id} className="rounded-lg bg-sky-50/50 px-3 py-2 border border-sky-100">
                                    <dt className="text-xs text-gray-500">{a.key}</dt>
                                    <dd className="text-sm font-medium text-gray-900">{a.value || '—'}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          )}

                          {/* Media */}
                          {reportDetails.media.length > 0 && (
                            <div>
                              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Photos</h3>
                              <div className="flex gap-2 flex-wrap">
                                {reportDetails.media.map((m) => (
                                  <div key={m.id} className="relative">
                                    <img src={m.url} alt="" className="h-20 w-20 rounded-lg object-cover border border-gray-200" />
                                    <span className={`absolute bottom-1 right-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                      m.visibility === 'public' ? 'bg-emerald-500/90 text-white' : 'bg-sky-500/90 text-white'
                                    }`}>
                                      {m.visibility === 'public' ? 'Public' : 'Private'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Possible Matches toggle */}
                          <div className="pt-3 border-t border-gray-100">
                            <button
                              onClick={() => {
                                if (isShowingMatches) {
                                  setShowMatchesFor(null);
                                } else {
                                  loadMatches(report.id);
                                }
                              }}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 transition-colors"
                            >
                              <Sparkles className="h-4 w-4" />
                              {isShowingMatches ? 'Hide Possible Matches' : 'View Possible Matches'}
                            </button>
                          </div>

                          {/* Meta */}
                          <div className="text-xs text-gray-400">
                            Created {new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {report.updated_at !== report.created_at && (
                              <> · Updated {new Date(report.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">Failed to load details.</p>
                      )}
                    </div>
                  )}

                  {/* Possible Matches section */}
                  {isShowingMatches && isExpanded && (
                    <div className="border-t border-gray-100 bg-sky-50/20 px-5 py-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="h-4 w-4 text-sky-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Possible Matches</h3>
                        <span className="text-xs text-gray-400">— sorted by match score</span>
                      </div>

                      {matchesLoading ? (
                        <div className="text-center py-6">
                          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-sky-600" />
                        </div>
                      ) : reportMatches.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">No possible matches found yet. We'll notify you when a match is detected.</p>
                      ) : (
                        <div className="space-y-3">
                          {reportMatches.map((match) => {
                            const OtherIcon = getCategoryIcon(match.otherReport.category?.name ?? 'Other');
                            return (
                              <div key={match.id} className="bg-white rounded-xl border border-gray-200 p-4">
                                {/* Match header */}
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-500">
                                      <OtherIcon className="h-5 w-5" />
                                    </div>
                                    <div>
                                      <span className="text-sm font-semibold text-gray-900">{match.otherReport.category?.name ?? 'Item'}</span>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <TypeBadge type={match.otherReport.type} />
                                        <StatusBadge status={match.otherReport.status} />
                                      </div>
                                    </div>
                                  </div>
                                  {/* Score badge */}
                                  <div className="flex flex-col items-end">
                                    <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                                      match.match_score >= 70 ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20' :
                                      match.match_score >= 40 ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20' :
                                      'bg-gray-50 text-gray-600 ring-1 ring-gray-500/20'
                                    }`}>
                                      {Math.round(match.match_score)}% match
                                    </div>
                                    <span className={`text-[10px] mt-0.5 ${match.match_score >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                      {match.match_score >= 70 ? 'Strong match' : 'Possible match'}
                                    </span>
                                  </div>
                                </div>

                                {/* Other report's public info — reuses same public-safe rendering */}
                                <div className="flex items-center gap-4 mb-2 text-sm text-gray-500">
                                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{match.otherReport.location_general}</span>
                                  {match.otherReport.date_occurred && (
                                    <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{new Date(match.otherReport.date_occurred).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                  )}
                                </div>

                                {match.otherPubAttrs.length > 0 && (
                                  <dl className="grid gap-1.5 sm:grid-cols-2 mb-3">
                                    {match.otherPubAttrs.map((a) => (
                                      <div key={a.id} className="rounded-lg bg-gray-50 px-3 py-1.5">
                                        <dt className="text-[11px] text-gray-500">{a.key}</dt>
                                        <dd className="text-sm font-medium text-gray-900">{a.value || '—'}</dd>
                                      </div>
                                    ))}
                                  </dl>
                                )}

                                {match.otherMedia.length > 0 && (
                                  <div className="flex gap-2 flex-wrap mb-3">
                                    {match.otherMedia.map((m) => (
                                      <img key={m.id} src={m.url} alt="" className="h-16 w-16 rounded-lg object-cover border border-gray-200" />
                                    ))}
                                  </div>
                                )}

                                {/* Actions */}
                                {match.status === 'confirmed_pending_verification' || match.status === 'verified' ? (
                                  <div className="space-y-3 pt-1">
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={async () => {
                                          // Look up existing verification session for this match
                                          const { data: existingSession } = await supabase
                                            .from('verification_sessions')
                                            .select('id')
                                            .eq('match_id', match.id)
                                            .maybeSingle();
                                          if (existingSession) {
                                            navigate(`/verify/${existingSession.id}`);
                                          }
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 transition-colors"
                                      >
                                        <ShieldCheck className="h-4 w-4" />
                                        {match.status === 'verified' ? 'View verification result' : 'Go to verification'}
                                      </button>
                                      {match.status === 'verified' && (
                                        <button
                                          onClick={() => navigate(`/messages/${match.id}`)}
                                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 transition-colors"
                                        >
                                          <MessageSquare className="h-4 w-4" />
                                          Message
                                        </button>
                                      )}
                                    </div>
                                    {match.status === 'verified' && (
                                      <HandoverPanel
                                        matchId={match.id}
                                        otherLabel={match.otherReport.type === 'lost' ? 'Lost item reporter' : 'Item finder'}
                                        isVerified={true}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex gap-2 pt-1">
                                    <button
                                      onClick={() => handleMatchAction(match.id, 'confirm')}
                                      disabled={actionLoading === match.id}
                                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 transition-colors"
                                    >
                                      <Check className="h-4 w-4" />
                                      This looks like my item — Continue
                                    </button>
                                    <button
                                      onClick={() => handleMatchAction(match.id, 'reject')}
                                      disabled={actionLoading === match.id}
                                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                                    >
                                      <X className="h-4 w-4" />
                                      Not a match
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
