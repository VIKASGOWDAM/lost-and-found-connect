import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useRouter, parsePath } from '@/lib/router';
import type { Match, Message, Report, Category } from '@/lib/types';
import { getCategoryIcon } from '@/lib/categoryIcons';
import { ChevronLeft, Send, MessageSquare, ShieldCheck, Flag, ArrowLeft, Loader2 } from 'lucide-react';

interface VerifiedMatch extends Match {
  lostReport: Report & { category: Category };
  foundReport: Report & { category: Category };
  unreadCount: number;
  lastMessage: Message | null;
}

export function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const { navigate, path } = useRouter();
  const [matches, setMatches] = useState<VerifiedMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const cleanPath = parsePath(path);
  const activeMatchId = cleanPath.startsWith('/messages/') ? cleanPath.split('/')[2] : null;

  const loadMatches = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: lostMatches } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'verified');

    const { data: foundMatches } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'verified');

    const allMatches = [...(lostMatches ?? []), ...(foundMatches ?? [])] as Match[];
    const seen = new Set<string>();
    const myMatches = allMatches.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    const enriched: VerifiedMatch[] = [];
    for (const m of myMatches) {
      const [{ data: lostReport }, { data: foundReport }] = await Promise.all([
        supabase
          .from('reports')
          .select('id, type, reporter_id, category_id, status, location_general, date_occurred, created_at, updated_at, category:categories(id, name, parent_id)')
          .eq('id', m.lost_report_id)
          .maybeSingle(),
        supabase
          .from('reports')
          .select('id, type, reporter_id, category_id, status, location_general, date_occurred, created_at, updated_at, category:categories(id, name, parent_id)')
          .eq('id', m.found_report_id)
          .maybeSingle(),
      ]);

      if (!lostReport || !foundReport) continue;
      if (lostReport.reporter_id !== user.id && foundReport.reporter_id !== user.id) continue;

      const { data: messages } = await supabase
        .from('messages')
        .select('id, match_id, sender_id, body, sent_at, is_system_relayed, read_at')
        .eq('match_id', m.id)
        .order('sent_at', { ascending: false });

      const msgs = (messages ?? []) as Message[];
      const unread = msgs.filter((msg) => msg.sender_id !== user.id && msg.read_at === null).length;

      enriched.push({
        ...m,
        lostReport: lostReport as unknown as Report & { category: Category },
        foundReport: foundReport as unknown as Report & { category: Category },
        unreadCount: unread,
        lastMessage: msgs[0] ?? null,
      });
    }

    enriched.sort((a, b) => {
      const aTime = new Date(a.lastMessage?.sent_at ?? a.updated_at).getTime();
      const bTime = new Date(b.lastMessage?.sent_at ?? b.updated_at).getTime();
      return bTime - aTime;
    });

    setMatches(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      if (!authLoading) navigate('/login');
      return;
    }
    loadMatches();
  }, [user, authLoading, navigate, loadMatches]);

  if (authLoading || (!user && authLoading)) return null;
  if (!user) return null;

  if (activeMatchId) {
    return <ChatThread matchId={activeMatchId} onBack={() => navigate('/messages')} />;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
            <p className="text-sm text-gray-500 mt-0.5">Conversations with your verified matches</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-sky-600" />
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No conversations yet</p>
            <p className="text-sm text-gray-400 mt-1">Messaging unlocks once a match has been verified.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {matches.map((m) => {
              const otherReport = m.lostReport.reporter_id === user.id ? m.foundReport : m.lostReport;
              const otherLabel = otherReport.type === 'lost' ? 'Lost item reporter' : 'Item finder';
              const Icon = getCategoryIcon(otherReport.category?.name ?? 'Other');
              return (
                <button
                  key={m.id}
                  onClick={() => navigate(`/messages/${m.id}`)}
                  className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-sky-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-50 text-gray-500 flex-shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-gray-900 truncate">{otherReport.category?.name ?? 'Item'}</span>
                        {m.lastMessage && (
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {new Date(m.lastMessage.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <ShieldCheck className="h-3 w-3 text-emerald-500" />
                        {otherLabel}
                      </span>
                      {m.lastMessage && (
                        <p className="text-sm text-gray-500 mt-1 truncate">
                          {m.lastMessage.sender_id === user.id ? 'You: ' : ''}
                          {m.lastMessage.body}
                        </p>
                      )}
                    </div>
                    {m.unreadCount > 0 && (
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-sky-500 px-2 text-xs font-bold text-white">
                        {m.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatThread({ matchId, onBack }: { matchId: string; onBack: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [otherLabel, setOtherLabel] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data: match } = await supabase
      .from('matches')
      .select('id, status, lost_report_id, found_report_id')
      .eq('id', matchId)
      .maybeSingle();

    if (!match) {
      setError('Conversation not found.');
      setLoading(false);
      return;
    }

    const [{ data: lostReport }, { data: foundReport }] = await Promise.all([
      supabase.from('reports').select('reporter_id, category:categories(name)').eq('id', match.lost_report_id).maybeSingle(),
      supabase.from('reports').select('reporter_id, category:categories(name)').eq('id', match.found_report_id).maybeSingle(),
    ]);

    const lr = lostReport as unknown as { reporter_id: string; category: { name: string } | null } | null;
    const fr = foundReport as unknown as { reporter_id: string; category: { name: string } | null } | null;
    if (!lr || !fr) {
      setError('Could not load conversation details.');
      setLoading(false);
      return;
    }

    if (lr.reporter_id !== user.id && fr.reporter_id !== user.id) {
      setError('You do not have access to this conversation.');
      setLoading(false);
      return;
    }

    setCategoryName(lr.category?.name ?? fr.category?.name ?? 'Item');

    const otherIsLost = lr.reporter_id !== user.id;
    setOtherLabel(otherIsLost ? 'Lost item reporter' : 'Item finder');

    if (match.status !== 'verified') {
      setIsVerified(false);
      setLoading(false);
      return;
    }

    setIsVerified(true);

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, match_id, sender_id, body, sent_at, is_system_relayed, read_at')
      .eq('match_id', matchId)
      .order('sent_at', { ascending: true });

    setMessages((msgs ?? []) as Message[]);

    // Mark received messages as read
    const unreadIds = (msgs ?? []).filter((m: Message) => m.sender_id !== user.id && m.read_at === null).map((m: Message) => m.id);
    if (unreadIds.length > 0) {
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
    }

    setLoading(false);
  }, [matchId, user]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  useEffect(() => {
    if (!isVerified || !user) return;
    const channel = supabase
      .channel(`messages:${matchId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        if (msg.sender_id !== user.id && msg.read_at === null) {
          (async () => {
            await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', msg.id);
          })();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isVerified, matchId, user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!user || !input.trim() || sending) return;
    setSending(true);
    const body = input.trim();
    setInput('');
    const { data, error: insertError } = await supabase
      .from('messages')
      .insert({ match_id: matchId, sender_id: user.id, body })
      .select('id, match_id, sender_id, body, sent_at, is_system_relayed, read_at')
      .single();
    if (insertError || !data) {
      setInput(body);
      setError('Failed to send message. Please try again.');
    } else {
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as Message]));
      setError(null);
    }
    setSending(false);
  };

  const handleReport = async () => {
    if (!user || !reportReason.trim()) return;
    setReportError(null);
    const { error: reportErr } = await supabase
      .from('fraud_flags')
      .insert({ match_id: matchId, user_id: user.id, reason: reportReason.trim(), severity: 'low' });
    if (reportErr) {
      setReportError('Failed to submit report. Please try again.');
      return;
    }
    setReportSubmitted(true);
    setReportReason('');
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-sky-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <p className="text-gray-500 font-medium">{error}</p>
          <button onClick={onBack} className="mt-4 text-sky-600 hover:text-sky-700 font-medium text-sm">Back to Messages</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 flex flex-col">
      {/* Thread header */}
      <div className="sticky top-16 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={onBack} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors flex-shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <span className="text-sm font-semibold text-gray-900 truncate block">{categoryName}</span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  {otherLabel}
                </span>
              </div>
            </div>
            {!showReport && !reportSubmitted && isVerified && (
              <button
                onClick={() => setShowReport(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Flag className="h-3.5 w-3.5" /> Report
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Report form */}
      {showReport && !reportSubmitted && (
        <div className="mx-auto max-w-2xl w-full px-4 sm:px-6 lg:px-8 pt-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flag className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-semibold text-gray-900">Report this conversation</h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">Let our team know if something feels wrong — for example, suspicious behavior or a scam attempt.</p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe the issue…"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
            />
            {reportError && <p className="text-xs text-red-600 mt-2">{reportError}</p>}
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleReport}
                disabled={!reportReason.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Submit report
              </button>
              <button
                onClick={() => { setShowReport(false); setReportReason(''); setReportError(null); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {reportSubmitted && (
        <div className="mx-auto max-w-2xl w-full px-4 sm:px-6 lg:px-8 pt-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span className="text-sm text-emerald-800">Your report has been submitted. Thank you.</span>
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 mx-auto max-w-2xl w-full px-4 sm:px-6 lg:px-8 py-4">
        {!isVerified ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 mb-4">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Messaging unlocks once verification is complete</h2>
            <p className="text-sm text-gray-500 mt-2 max-w-sm">
              This match hasn't been verified yet. Once the finder answers the verification questions, you'll be able to chat here.
            </p>
            <button onClick={onBack} className="mt-6 flex items-center gap-1.5 text-sm text-sky-600 hover:text-sky-700 font-medium">
              <ChevronLeft className="h-4 w-4" /> Back to Messages
            </button>
          </div>
        ) : (
          <div ref={scrollRef} className="space-y-3 overflow-y-auto pb-32" style={{ maxHeight: 'calc(100vh - 16rem)' }}>
            {messages.length === 0 ? (
              <div className="text-center py-16">
                <MessageSquare className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No messages yet. Say hello to {otherLabel}.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender_id === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isMine ? 'bg-sky-600 text-white' : 'bg-white border border-gray-200 text-gray-900'}`}>
                      {msg.is_system_relayed && (
                        <span className={`text-[10px] font-semibold uppercase tracking-wide block mb-1 ${isMine ? 'text-sky-200' : 'text-gray-400'}`}>
                          System
                        </span>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                      <span className={`text-[10px] mt-1 block ${isMine ? 'text-sky-200' : 'text-gray-400'}`}>
                        {new Date(msg.sent_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Input bar */}
      {isVerified && (
        <div className="sticky bottom-0 bg-white/80 backdrop-blur-md border-t border-gray-200">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-3">
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message…"
                disabled={sending}
                className="flex-1 rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
