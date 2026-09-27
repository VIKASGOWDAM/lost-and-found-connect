import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { HandoverView, HandoverMethod, HandoverStatus } from '@/lib/types';
import {
  CalendarClock, MapPin, Check, X, Flag, Star, HandHeart, Loader2,
  Clock, ShieldCheck, AlertCircle, PartyPopper, Edit3,
} from 'lucide-react';

interface HandoverPanelProps {
  matchId: string;
  otherLabel: string;
  isVerified: boolean;
}

export function HandoverPanel({ matchId, otherLabel, isVerified }: HandoverPanelProps) {
  const { user } = useAuth();
  const [handover, setHandover] = useState<HandoverView | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [method, setMethod] = useState<HandoverMethod>('in_person');
  const [scheduledAt, setScheduledAt] = useState('');
  const [locationLabel, setLocationLabel] = useState('');

  // Dispute state
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  // Rating state
  const [myRating, setMyRating] = useState<number | null>(null);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  // Location exact state
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  const loadHandover = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data: hvData, error: hvError } = await supabase
      .from('handover_view')
      .select('*')
      .eq('match_id', matchId)
      .maybeSingle();

    if (hvError) {
      setError('Failed to load handover details.');
      setLoading(false);
      return;
    }

    if (hvData) {
      const hv = hvData as HandoverView;
      setHandover(hv);
      setMethod(hv.method);
      if (hv.scheduled_at) {
        setScheduledAt(new Date(hv.scheduled_at).toISOString().slice(0, 16));
      }
      setLocationLabel(hv.location_label ?? '');

      // Check if current user has already rated
      const { data: existingRating } = await supabase
        .from('ratings')
        .select('score')
        .eq('handover_id', hv.id)
        .eq('rater_id', user.id)
        .maybeSingle();
      if (existingRating) {
        setMyRating(existingRating.score);
      }
    }

    setLoading(false);
  }, [matchId, user]);

  useEffect(() => {
    if (isVerified) {
      loadHandover();
    } else {
      setLoading(false);
    }
  }, [isVerified, loadHandover]);

  const handlePropose = async () => {
    if (!user) return;
    setActionLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('propose_handover', {
        p_match_id: matchId,
        p_proposed_by: user.id,
        p_method: method,
        p_scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        p_location_label: locationLabel || null,
      });
      if (rpcError) throw rpcError;
      await loadHandover();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to propose handover');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!user || !handover) return;
    setActionLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('accept_handover', {
        p_handover_id: handover.id,
        p_user_id: user.id,
      });
      if (rpcError) throw rpcError;
      await loadHandover();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept handover');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!user || !handover) return;
    setActionLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('edit_handover', {
        p_handover_id: handover.id,
        p_user_id: user.id,
        p_scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        p_location_label: locationLabel || null,
        p_method: method,
      });
      if (rpcError) throw rpcError;
      await loadHandover();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit handover');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!user || !handover) return;
    setActionLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('confirm_handover', {
        p_handover_id: handover.id,
        p_user_id: user.id,
      });
      if (rpcError) throw rpcError;
      await loadHandover();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm handover');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispute = async () => {
    if (!user || !handover) return;
    setActionLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('dispute_handover', {
        p_handover_id: handover.id,
        p_user_id: user.id,
        p_reason: disputeReason || 'Marked as did not happen',
      });
      if (rpcError) throw rpcError;
      setShowDispute(false);
      setDisputeReason('');
      await loadHandover();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit dispute');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRate = async () => {
    if (!user || !handover) return;
    setActionLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('rate_handover', {
        p_handover_id: handover.id,
        p_rater_id: user.id,
        p_score: ratingScore,
        p_comment: ratingComment || null,
      });
      if (rpcError) throw rpcError;
      setRatingSubmitted(true);
      setMyRating(ratingScore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit rating');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetLocationExact = async () => {
    if (!user || !handover) return;
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      setError('Please enter valid latitude and longitude values.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('set_handover_location_exact', {
        p_handover_id: handover.id,
        p_user_id: user.id,
        p_lat: latNum,
        p_lng: lngNum,
      });
      if (rpcError) throw rpcError;
      setLat('');
      setLng('');
      await loadHandover();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set location');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isVerified) {
    return null;
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading handover details…
        </div>
      </div>
    );
  }

  const status = handover?.status;
  const now = new Date();
  const scheduledDate = handover?.scheduled_at ? new Date(handover.scheduled_at) : null;
  const revealDate = handover?.location_reveal_at ? new Date(handover.location_reveal_at) : null;
  const canConfirm = status === 'scheduled' && scheduledDate && now > scheduledDate;
  const isProposer = handover?.proposed_by === user?.id;
  const canRevealExact = handover?.location_exact !== null && handover?.location_exact !== undefined;
  const beforeReveal = revealDate && now < revealDate;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <HandHeart className="h-4 w-4 text-sky-600" />
        <h3 className="text-sm font-semibold text-gray-900">Handover</h3>
        {status && <StatusPill status={status} />}
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* No handover yet — propose form */}
      {!handover && (
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-4">
            Propose a handover to coordinate returning the item to its owner.
          </p>
          <ProposeForm
            method={method}
            setMethod={setMethod}
            scheduledAt={scheduledAt}
            setScheduledAt={setScheduledAt}
            locationLabel={locationLabel}
            setLocationLabel={setLocationLabel}
            onSubmit={handlePropose}
            loading={actionLoading}
            submitLabel="Propose Handover"
          />
        </div>
      )}

      {/* PROPOSED state */}
      {status === 'proposed' && handover && (
        <div className="p-4 space-y-4">
          <div className="rounded-lg bg-sky-50 border border-sky-100 px-3 py-2.5">
            <p className="text-xs text-sky-700">
              {isProposer
                ? `Waiting for ${otherLabel} to accept your proposal.`
                : `${otherLabel} proposed this handover. You can accept or suggest changes.`}
            </p>
          </div>

          <HandoverDetails handover={handover} />

          {isProposer ? (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
                <Edit3 className="h-3 w-3" /> Edit your proposal
              </div>
              <ProposeForm
                method={method}
                setMethod={setMethod}
                scheduledAt={scheduledAt}
                setScheduledAt={setScheduledAt}
                locationLabel={locationLabel}
                setLocationLabel={setLocationLabel}
                onSubmit={handleEdit}
                loading={actionLoading}
                submitLabel="Update Proposal"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleAccept}
                disabled={actionLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Accept Handover
              </button>
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
                  <Edit3 className="h-3 w-3" /> Suggest changes instead
                </div>
                <ProposeForm
                  method={method}
                  setMethod={setMethod}
                  scheduledAt={scheduledAt}
                  setScheduledAt={setScheduledAt}
                  locationLabel={locationLabel}
                  setLocationLabel={setLocationLabel}
                  onSubmit={handleEdit}
                  loading={actionLoading}
                  submitLabel="Update & Re-propose"
                />
              </div>
            </div>
          )}

          <DisputeButton
            show={showDispute}
            setShow={setShowDispute}
            reason={disputeReason}
            setReason={setDisputeReason}
            onDispute={handleDispute}
            loading={actionLoading}
          />
        </div>
      )}

      {/* SCHEDULED state */}
      {status === 'scheduled' && handover && (
        <div className="p-4 space-y-4">
          <HandoverDetails handover={handover} />

          {/* Location reveal notice */}
          {beforeReveal && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 flex items-start gap-2">
              <Clock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-800">Exact location will be shown 2 hours before your scheduled time</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {revealDate && <>Available from {revealDate.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</>}
                </p>
              </div>
            </div>
          )}

          {/* Exact location shown after reveal */}
          {canRevealExact && !beforeReveal && handover.location_exact && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 flex items-start gap-2">
              <MapPin className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-emerald-800">Exact location revealed</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {handover.location_exact.y.toFixed(6)}, {handover.location_exact.x.toFixed(6)}
                </p>
              </div>
            </div>
          )}

          {/* Set exact location (either participant can set it while scheduled) */}
          {!canRevealExact && (
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
                <MapPin className="h-3 w-3" /> Set exact meeting point (optional)
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="Latitude"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none"
                />
                <input
                  type="text"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="Longitude"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none"
                />
                <button
                  onClick={handleSetLocationExact}
                  disabled={actionLoading || !lat || !lng}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 disabled:opacity-50 transition-colors"
                >
                  Set
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Only visible to both parties 2 hours before the scheduled time.</p>
            </div>
          )}

          {/* Confirm receipt */}
          {canConfirm && (
            <div className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-3">
              <p className="text-xs font-medium text-sky-800 mb-2">The scheduled time has passed. Did the handover happen?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={actionLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Confirm receipt
                </button>
              </div>
              <div className="mt-2 text-center">
                <button
                  onClick={() => setShowDispute(true)}
                  className="text-xs text-red-500 hover:text-red-600 font-medium"
                >
                  This didn't happen
                </button>
              </div>
            </div>
          )}

          {/* Show confirmation status */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              {handover.confirmed_by_lost ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Clock className="h-3.5 w-3.5 text-gray-400" />}
              Lost reporter {handover.confirmed_by_lost ? 'confirmed' : 'pending'}
            </span>
            <span className="flex items-center gap-1">
              {handover.confirmed_by_found ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Clock className="h-3.5 w-3.5 text-gray-400" />}
              Finder {handover.confirmed_by_found ? 'confirmed' : 'pending'}
            </span>
          </div>

          <DisputeButton
            show={showDispute}
            setShow={setShowDispute}
            reason={disputeReason}
            setReason={setDisputeReason}
            onDispute={handleDispute}
            loading={actionLoading}
          />
        </div>
      )}

      {/* COMPLETED state */}
      {status === 'completed' && handover && (
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
            <PartyPopper className="h-4 w-4 text-emerald-600" />
            <p className="text-xs font-medium text-emerald-800">Handover completed! Both parties confirmed receipt.</p>
          </div>

          <HandoverDetails handover={handover} />

          {/* Rating section */}
          {myRating === null && !ratingSubmitted && (
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-4 w-4 text-amber-500" />
                <h4 className="text-sm font-semibold text-gray-900">Rate this experience</h4>
              </div>
              <p className="text-xs text-gray-500 mb-3">How was your experience with {otherLabel}?</p>
              <div className="flex gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setRatingScore(s)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-7 w-7 ${s <= ratingScore ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`}
                    />
                  </button>
                ))}
              </div>
              <textarea
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder="Optional comment…"
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
              />
              <button
                onClick={handleRate}
                disabled={actionLoading}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                Submit Rating
              </button>
            </div>
          )}

          {ratingSubmitted && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <p className="text-xs font-medium text-emerald-800">Thank you for rating this experience!</p>
            </div>
          )}

          {myRating !== null && !ratingSubmitted && (
            <p className="text-xs text-gray-400 text-center">You already rated this handover ({myRating} stars).</p>
          )}
        </div>
      )}

      {/* DISPUTED state */}
      {status === 'disputed' && handover && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <p className="text-xs font-medium text-red-800">This handover has been disputed and flagged for review.</p>
          </div>
          <HandoverDetails handover={handover} />
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: HandoverStatus }) {
  const styles: Record<HandoverStatus, string> = {
    proposed: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    scheduled: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    disputed: 'bg-red-50 text-red-700 ring-red-600/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function HandoverDetails({ handover }: { handover: HandoverView }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2 text-gray-600">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide w-16">Method</span>
        <span className="text-sm text-gray-900">
          {handover.method === 'in_person' ? 'In person' : 'Organization desk'}
        </span>
      </div>
      {handover.scheduled_at && (
        <div className="flex items-center gap-2 text-gray-600">
          <CalendarClock className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">When</span>
          <span className="text-sm text-gray-900">
            {new Date(handover.scheduled_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>
      )}
      {handover.location_label && (
        <div className="flex items-center gap-2 text-gray-600">
          <MapPin className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Where</span>
          <span className="text-sm text-gray-900">{handover.location_label}</span>
        </div>
      )}
    </div>
  );
}

function ProposeForm({
  method, setMethod, scheduledAt, setScheduledAt, locationLabel, setLocationLabel,
  onSubmit, loading, submitLabel,
}: {
  method: HandoverMethod;
  setMethod: (m: HandoverMethod) => void;
  scheduledAt: string;
  setScheduledAt: (s: string) => void;
  locationLabel: string;
  setLocationLabel: (s: string) => void;
  onSubmit: () => void;
  loading: boolean;
  submitLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Method</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMethod('in_person')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              method === 'in_person' ? 'bg-sky-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            In person
          </button>
          <button
            type="button"
            onClick={() => setMethod('org_desk')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              method === 'org_desk' ? 'bg-sky-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            Organization desk
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Suggested time</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">General location (e.g. "Mall Help Desk, Ground Floor")</label>
        <input
          type="text"
          value={locationLabel}
          onChange={(e) => setLocationLabel(e.target.value)}
          placeholder="General meeting area description"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
        />
      </div>
      <button
        onClick={onSubmit}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {submitLabel}
      </button>
    </div>
  );
}

function DisputeButton({
  show, setShow, reason, setReason, onDispute, loading,
}: {
  show: boolean;
  setShow: (s: boolean) => void;
  reason: string;
  setReason: (s: string) => void;
  onDispute: () => void;
  loading: boolean;
}) {
  if (!show) {
    return (
      <button
        onClick={() => setShow(true)}
        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 font-medium"
      >
        <Flag className="h-3 w-3" /> This didn't happen
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Flag className="h-3.5 w-3.5 text-red-500" />
        <span className="text-xs font-semibold text-red-700">Report a dispute</span>
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Describe what went wrong…"
        rows={2}
        className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={onDispute}
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit dispute'}
        </button>
        <button
          onClick={() => { setShow(false); setReason(''); }}
          className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
