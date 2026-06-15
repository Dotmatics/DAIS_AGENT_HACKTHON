import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@databricks/appkit-ui/react';

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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Mock SMS Health Check</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Simulates SMS for rural users. Collects pincode, age, and symptoms, then recommends facilities.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Phone number</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => loadThread(phone.trim()).catch(() => undefined)}
              placeholder="+919876543210"
            />
          </CardContent>
        </Card>

        <Card className="h-[min(500px,60vh)] flex flex-col">
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-2" ref={scrollRef}>
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center mt-8">
                Try: &quot;I don&apos;t feel well&quot; then follow the prompts.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={`${m.direction}-${i}`}
                className={`p-3 rounded-md text-sm max-w-[85%] ${
                  m.direction === 'inbound'
                    ? 'bg-primary/10 ml-auto'
                    : 'bg-muted mr-auto'
                }`}
              >
                {m.body}
              </div>
            ))}
          </CardContent>
          <form onSubmit={sendMessage} className="p-3 border-t flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type SMS message…"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              {loading ? 'Sending…' : 'Send'}
            </Button>
          </form>
        </Card>
        {error && <p className="text-sm text-destructive">{error}</p>}
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
