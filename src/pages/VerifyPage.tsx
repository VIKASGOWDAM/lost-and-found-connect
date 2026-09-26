import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import type { VerificationSessionView, VerificationChallenge } from '@/lib/types';
import { ChevronLeft, ShieldCheck, ShieldAlert, Clock, Check, X, AlertCircle, Loader2, MessageSquareWarning } from 'lucide-react';

const VERIFY_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-match`;

export function VerifyPage({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [sessionView, setSessionView] = useState<VerificationSessionView | null>(null);
  const [challenges, setChallenges] = useState<VerificationChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Finder state
  const [currentChallengeIdx, setCurrentChallengeIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [attemptResult, setAttemptResult] = useState<{ passed: boolean; attempt: number; sessionEnded: boolean } | null>(null);

  // Report problem state
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const loadSession = useCallback(async () => {
    if (!user) return;
    const { data, error: viewError } = await supabase
      .from('verification_session_view')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (viewError || !data) {
      setError('Verification session not found or you do not have access.');
      setLoading(false);
      return;
    }

    const sv = data as VerificationSessionView;
    setSessionView(sv);

    // If finder, load challenges
    if (sv.viewer_role === 'found_reporter' && (sv.status === 'pending' || sv.status === 'in_progress')) {
      const { data: challData } = await supabase
        .from('verification_challenges')
        .select('id, session_id, source_attribute_id, challenge_prompt, submitted_answer, is_correct, attempt_number, answered_at')
        .eq('session_id', sessionId)
        .eq('attempt_number', sv.attempt_count > 0 ? sv.attempt_count : 1)
        .order('id', { ascending: true });

      if (challData) setChallenges(challData as VerificationChallenge[]);
    }

    setLoading(false);
  }, [sessionId, user]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadSession();
  }, [user, navigate, loadSession]);

  const handleSubmitAnswers = async () => {
    if (!sessionView || challenges.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(VERIFY_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'submit',
          session_id: sessionId,
          answers: challenges.map((c) => ({ challenge_id: c.id, answer: answers[c.id] ?? '' })),
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Request failed (${response.status})`);
      }

      const result = await response.json();
      setAttemptResult({
        passed: result.passed,
        attempt: result.attempt_number,
        sessionEnded: result.session_ended,
      });

      if (!result.session_ended) {
        // Reload for next attempt round
        await loadSession();
        setAnswers({});
        setCurrentChallengeIdx(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit answers');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportProblem = async () => {
    if (!user || !sessionView || !reportReason.trim()) return;
    setSubmitting(true);
    try {
      const response = await fetch(VERIFY_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'report_problem',
          match_id: sessionView.match_id,
          user_id: user.id,
          reason: reportReason,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit report');
      setReportSubmitted(true);
    } catch {
      setError('Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-sky-600" />
      </div>
    );
  }

  if (error || !sessionView) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <AlertCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{error ?? 'Something went wrong'}</p>
          <button onClick={() => navigate('/my-reports')} className="mt-4 text-sky-600 hover:text-sky-700 font-medium text-sm">Back to My Reports</button>
        </div>
      </div>
    );
  }

  const isLostReporter = sessionView.viewer_role === 'lost_reporter';
  const isFoundReporter = sessionView.viewer_role === 'found_reporter';
  const status = sessionView.status;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => navigate('/my-reports')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ChevronLeft className="h-4 w-4" /> Back to My Reports
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                status === 'passed' ? 'bg-emerald-50 text-emerald-600' :
                status === 'failed' ? 'bg-red-50 text-red-600' :
                status === 'manual_review' ? 'bg-amber-50 text-amber-600' :
                'bg-sky-50 text-sky-600'
              }`}>
                {status === 'passed' ? <ShieldCheck className="h-6 w-6" /> :
                 status === 'failed' ? <ShieldAlert className="h-6 w-6" /> :
                 status === 'manual_review' ? <AlertCircle className="h-6 w-6" /> :
                 <Clock className="h-6 w-6" />}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Identity Verification</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {isLostReporter ? 'You are the item owner (lost report)' : 'You are the finder (found report)'}
                </p>
              </div>
            </div>
          </div>

          {/* PASSED state */}
          {status === 'passed' && (
            <div className="p-8 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-4">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Verified!</h2>
              <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
                The finder successfully answered enough verification questions. You can now proceed to arrange the handover.
              </p>
              <button
                onClick={() => navigate('/my-reports')}
                className="mt-6 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 transition-colors"
              >
                Back to My Reports
              </button>
            </div>
          )}

          {/* FAILED state */}
          {status === 'failed' && (
            <div className="p-8 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">This match could not be verified</h2>
              <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
                The verification process did not pass after {sessionView.max_attempts} attempts. The match has been closed.
              </p>

              {!reportSubmitted ? (
                <div className="mt-6">
                  {!showReportForm ? (
                    <button
                      onClick={() => setShowReportForm(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <MessageSquareWarning className="h-4 w-4" />
                      Report a problem
                    </button>
                  ) : (
                    <div className="text-left max-w-md mx-auto">
                      <textarea
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        placeholder="Describe the issue you encountered…"
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                      />
                      <button
                        onClick={handleReportProblem}
                        disabled={submitting || !reportReason.trim()}
                        className="mt-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 transition-colors"
                      >
                        {submitting ? 'Submitting…' : 'Submit report'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-emerald-600 mt-4">Your report has been submitted. Thank you.</p>
              )}

              <button
                onClick={() => navigate('/my-reports')}
                className="mt-6 block mx-auto text-sky-600 hover:text-sky-700 font-medium text-sm"
              >
                Back to My Reports
              </button>
            </div>
          )}

          {/* MANUAL REVIEW state */}
          {status === 'manual_review' && (
            <div className="p-8 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600 mb-4">
                <AlertCircle className="h-8 w-8" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Manual review required</h2>
              <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
                This report does not have enough private verification fields to run an automated check.
                Our team will review this match manually.
              </p>
              <button
                onClick={() => navigate('/my-reports')}
                className="mt-6 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 transition-colors"
              >
                Back to My Reports
              </button>
            </div>
          )}

          {/* LOST REPORTER view: pending / in_progress */}
          {isLostReporter && (status === 'pending' || status === 'in_progress') && (
            <div className="p-8 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-sky-50 text-sky-600 mb-4">
                <Clock className="h-8 w-8" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Waiting for the finder</h2>
              <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
                The finder needs to answer a few questions to confirm they have your item.
                You will be notified once the verification is complete.
              </p>
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Attempt {sessionView.attempt_count > 0 ? sessionView.attempt_count : 1} of {sessionView.max_attempts}
              </div>
            </div>
          )}

          {/* FINDER view: pending / in_progress */}
          {isFoundReporter && (status === 'pending' || status === 'in_progress') && (
            <div className="p-6">
              {attemptResult && !attemptResult.sessionEnded && !attemptResult.passed && (
                <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <X className="h-5 w-5 text-amber-600" />
                    <p className="text-sm font-medium text-amber-900">
                      Attempt {attemptResult.attempt - 1} did not pass. Please try again.
                    </p>
                  </div>
                  <p className="text-xs text-amber-700 mt-1">
                    You have {sessionView.max_attempts - sessionView.attempt_count} attempt(s) remaining.
                    We do not show which specific answers were wrong to protect the verification process.
                  </p>
                </div>
              )}

              {challenges.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-900">Answer the verification questions</h2>
                    <span className="text-xs font-medium text-gray-500">
                      Question {currentChallengeIdx + 1} of {challenges.length}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="flex gap-1 mb-6">
                    {challenges.map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          idx < currentChallengeIdx ? 'bg-sky-600' :
                          idx === currentChallengeIdx ? 'bg-sky-400' : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Current challenge */}
                  <div className="rounded-xl border border-gray-200 p-5 mb-4">
                    <p className="text-sm font-medium text-gray-900 mb-3">
                      {challenges[currentChallengeIdx].challenge_prompt}
                    </p>
                    <textarea
                      value={answers[challenges[currentChallengeIdx].id] ?? ''}
                      onChange={(e) => setAnswers((prev) => ({
                        ...prev,
                        [challenges[currentChallengeIdx].id]: e.target.value,
                      }))}
                      placeholder="Type your answer…"
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                    />
                  </div>

                  {/* Navigation */}
                  <div className="flex justify-between">
                    <button
                      onClick={() => setCurrentChallengeIdx((i) => Math.max(0, i - 1))}
                      disabled={currentChallengeIdx === 0}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-0 transition-all"
                    >
                      <ChevronLeft className="h-4 w-4" /> Previous
                    </button>
                    {currentChallengeIdx < challenges.length - 1 ? (
                      <button
                        onClick={() => setCurrentChallengeIdx((i) => i + 1)}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 transition-colors"
                      >
                        Next <ChevronLeft className="h-4 w-4 rotate-180" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSubmitAnswers}
                        disabled={submitting}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 transition-colors"
                      >
                        {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <><Check className="h-4 w-4" /> Submit all answers</>}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Footer info */}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/30">
            <p className="text-xs text-gray-400">
              Verification uses private attributes from the lost report. The real answers are never sent to your device — only whether your submitted answers were correct.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
