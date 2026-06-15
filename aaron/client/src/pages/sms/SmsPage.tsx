import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@databricks/appkit-ui/react';
import { ArrowUp, Battery, ChevronLeft, HeartPulse, Info, Plus, Signal, Wifi } from 'lucide-react';

interface Message {
  direction: 'inbound' | 'outbound';
  body: string;
  created_at?: string;
}

interface SessionInfo {
  postal_code?: string | null;
  age?: number | null;
  symptoms?: string | null;
  status?: string;
}

interface ThreadData {
  session: SessionInfo | null;
  messages: Message[];
  recommendations: Array<{
    facility_name: string;
    facility_phone: string;
    distance_km: number;
    rank: number;
  }>;
  coverageGap: {
    has_coverage_gap: boolean;
    nearest_distance_km: number;
  } | null;
}

interface GapStats {
  stats: { total_sessions: string; completed_sessions: string; coverage_gaps: string };
  recentGaps: Array<{
    postal_code: string;
    symptoms: string;
    nearest_distance_km: number;
    has_coverage_gap: boolean;
    phone: string;
  }>;
}

function formatMessageTime(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function StatusBar() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[11px] font-semibold text-white/90">
      <span>{time}</span>
      <div className="absolute left-1/2 top-2 h-[26px] w-[100px] -translate-x-1/2 rounded-full bg-black shadow-inner" />
      <div className="flex items-center gap-1.5">
        <Signal className="h-3.5 w-3.5" strokeWidth={2.5} />
        <Wifi className="h-3.5 w-3.5" strokeWidth={2.5} />
        <Battery className="h-3.5 w-3.5" strokeWidth={2.5} />
      </div>
    </div>
  );
}

function PhoneSmsChat({
  phone,
  messages,
  input,
  loading,
  error,
  scrollRef,
  onInputChange,
  onSubmit,
}: {
  phone: string;
  messages: Message[];
  input: string;
  loading: boolean;
  error: string | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const canSend = input.trim().length > 0 && !loading;

  return (
    <div className="relative mx-auto w-full max-w-[390px]">
      {/* Phone frame */}
      <div className="rounded-[3rem] bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-900 p-3 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
        {/* Side buttons (decorative) */}
        <div className="absolute -left-[2px] top-28 h-10 w-[3px] rounded-l bg-zinc-600" />
        <div className="absolute -left-[2px] top-44 h-16 w-[3px] rounded-l bg-zinc-600" />
        <div className="absolute -left-[2px] top-64 h-16 w-[3px] rounded-l bg-zinc-600" />
        <div className="absolute -right-[2px] top-36 h-20 w-[3px] rounded-r bg-zinc-600" />

        {/* Screen */}
        <div className="relative flex h-[680px] flex-col overflow-hidden rounded-[2.35rem] bg-[#000]">
          {/* Wallpaper + messages app */}
          <div className="relative flex min-h-0 flex-1 flex-col bg-gradient-to-b from-[#1c1c1e] via-[#0f0f10] to-[#0a0a0b]">
            <StatusBar />

            {/* Messages header */}
            <div className="flex items-center gap-2 border-b border-white/5 bg-[#1c1c1e]/95 px-3 py-2.5 backdrop-blur-md">
              <ChevronLeft className="h-5 w-5 text-[#0a84ff]" strokeWidth={2.5} />
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 shadow-md">
                  <HeartPulse className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-white">Aaron Health</div>
                  <div className="truncate text-[11px] text-zinc-400">{phone || 'Demo SMS line'}</div>
                </div>
              </div>
              <Info className="h-5 w-5 text-[#0a84ff]" strokeWidth={2.5} />
            </div>

            {/* Chat thread */}
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.08), transparent 40%), radial-gradient(circle at 80% 0%, rgba(59,130,246,0.08), transparent 35%)',
              }}
            >
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
                    <HeartPulse className="h-7 w-7 text-emerald-400" />
                  </div>
                  <p className="text-sm font-medium text-zinc-300">Aaron Rural Health SMS</p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    Try &quot;I don&apos;t feel well&quot; — we&apos;ll ask for pincode, age, and symptoms.
                  </p>
                </div>
              )}

              {messages.map((m, i) => {
                const isUser = m.direction === 'inbound';
                const time = formatMessageTime(m.created_at);
                return (
                  <div
                    key={`${m.direction}-${i}`}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[82%] px-3.5 py-2 text-[15px] leading-snug shadow-sm ${
                        isUser
                          ? 'rounded-[20px] rounded-br-md bg-[#34c759] text-white'
                          : 'rounded-[20px] rounded-bl-md bg-[#3a3a3c] text-white'
                      }`}
                    >
                      {m.body}
                    </div>
                    {time && (
                      <span className="mt-1 px-1 text-[10px] text-zinc-500">{time}</span>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div className="flex items-start">
                  <div className="rounded-[20px] rounded-bl-md bg-[#3a3a3c] px-4 py-3">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={onSubmit}
              className="border-t border-white/5 bg-[#1c1c1e]/95 px-3 py-2.5 backdrop-blur-md"
            >
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3a3a3c] text-[#0a84ff]"
                  tabIndex={-1}
                  aria-hidden
                >
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </button>
                <div className="min-w-0 flex-1 rounded-full border border-white/10 bg-[#2c2c2e] px-4 py-2">
                  <input
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    placeholder="Text Message"
                    disabled={loading}
                    aria-label="SMS message"
                    className="w-full bg-transparent text-[15px] text-white placeholder:text-zinc-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label="Send message"
                  className={`mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${
                    canSend
                      ? 'bg-[#0a84ff] text-white shadow-lg shadow-blue-500/30'
                      : 'bg-[#3a3a3c] text-zinc-500'
                  }`}
                >
                  <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
                </button>
              </div>
            </form>

            {/* Home indicator */}
            <div className="flex justify-center pb-2 pt-1">
              <div className="h-1 w-28 rounded-full bg-white/30" />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SmsPage() {
  const [phone, setPhone] = useState('+919876543210');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [recommendations, setRecommendations] = useState<ThreadData['recommendations']>([]);
  const [coverageGap, setCoverageGap] = useState<ThreadData['coverageGap']>(null);
  const [gapStats, setGapStats] = useState<GapStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async (phoneNumber: string) => {
    const res = await fetch(`/api/sms/thread/${encodeURIComponent(phoneNumber)}`);
    if (!res.ok) throw new Error('Failed to load thread');
    const data: ThreadData = await res.json();
    setMessages(data.messages);
    setSession(data.session);
    setRecommendations(data.recommendations);
    setCoverageGap(data.coverageGap);
  }, []);

  const loadStats = useCallback(async () => {
    const res = await fetch('/api/sms/stats');
    if (res.ok) {
      setGapStats(await res.json());
    }
  }, []);

  useEffect(() => {
    loadStats().catch(() => undefined);
  }, [loadStats]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !phone.trim()) return;
    setLoading(true);
    setError(null);
    setInput('');
    try {
      const res = await fetch('/api/sms/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), message: text }),
      });
      if (!res.ok) throw new Error('SMS send failed');
      await loadThread(phone.trim());
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px] max-w-7xl mx-auto">
      <div className="space-y-6">
        <div className="text-center xl:text-left">
          <h2 className="text-2xl font-bold text-foreground">Mock SMS Health Check</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl mx-auto xl:mx-0">
            Simulates SMS for rural users on a mobile device. Collects pincode, age, and symptoms,
            then recommends nearby facilities.
          </p>
        </div>

        <div className="mx-auto w-full max-w-[390px]">
          <label htmlFor="demo-phone" className="mb-2 block text-sm font-medium text-foreground">
            Phone number
          </label>
          <Input
            id="demo-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => loadThread(phone.trim()).catch(() => undefined)}
            placeholder="+919876543210"
            className="font-mono"
          />
        </div>

        <PhoneSmsChat
          phone={phone}
          messages={messages}
          input={input}
          loading={loading}
          error={error}
          scrollRef={scrollRef}
          onInputChange={setInput}
          onSubmit={sendMessage}
        />
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Extracted intake</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div><span className="text-muted-foreground">Pincode:</span> {session?.postal_code ?? '—'}</div>
            <div><span className="text-muted-foreground">Age:</span> {session?.age ?? '—'}</div>
            <div><span className="text-muted-foreground">Symptoms:</span> {session?.symptoms ?? '—'}</div>
            <div><span className="text-muted-foreground">Status:</span> {session?.status ?? 'new'}</div>
          </CardContent>
        </Card>

        {recommendations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recommended facilities</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              {recommendations.map((r) => (
                <div key={r.rank} className="border-b pb-2 last:border-0">
                  <div className="font-medium">{r.facility_name}</div>
                  <div className="text-muted-foreground">{Math.round(r.distance_km)} km · {r.facility_phone}</div>
                </div>
              ))}
              {coverageGap?.has_coverage_gap && (
                <p className="text-amber-600 dark:text-amber-400">
                  Coverage gap: nearest facility {Math.round(coverageGap.nearest_distance_km)} km away.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {gapStats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coverage gap stats</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>Sessions: {gapStats.stats.total_sessions}</div>
              <div>Completed: {gapStats.stats.completed_sessions}</div>
              <div>Gaps flagged: {gapStats.stats.coverage_gaps}</div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
