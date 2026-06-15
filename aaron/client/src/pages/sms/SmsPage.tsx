import { useEffect, useRef, useState } from 'react';
import {
  type AgentChatEvent,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  useAgentChat,
  usePluginClientConfig,
} from '@databricks/appkit-ui/react';
import { ArrowUp, Battery, ChevronLeft, HeartPulse, Info, Plus, Signal, Wifi } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  time: string;
}

interface IntakeBundle {
  symptomSummary: string;
  chosenLocation: {
    pincode: string | null;
    officename: string | null;
    district: string | null;
    state: string | null;
  } | null;
  geoConfidence: number;
  nearestFacility: {
    name: string;
    phone: string | null;
    distanceKm: number | null;
    specialties: string | null;
  } | null;
  facilityConfidence: number;
  hasCoverageGap: boolean;
}

interface AgentsClientConfig {
  agents: string[];
  defaultAgent: string | null;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function confidenceLabel(score: number): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive';
} {
  if (score >= 0.8) return { label: `High (${Math.round(score * 100)}%)`, variant: 'default' };
  if (score >= 0.55) return { label: `Medium (${Math.round(score * 100)}%)`, variant: 'secondary' };
  return { label: `Low (${Math.round(score * 100)}%)`, variant: 'destructive' };
}

function locationText(loc: IntakeBundle['chosenLocation']): string {
  if (!loc) return 'Not resolved';
  return (
    [loc.officename, loc.district, loc.state].filter(Boolean).join(', ') +
    (loc.pincode ? ` (${loc.pincode})` : '')
  );
}

function parseBundle(output: string | undefined): IntakeBundle | null {
  if (!output) return null;
  try {
    const parsed: unknown = JSON.parse(output);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'bundle' in parsed &&
      (parsed as { bundle?: unknown }).bundle
    ) {
      return (parsed as { bundle: IntakeBundle }).bundle;
    }
  } catch {
    return null;
  }
  return null;
}

function StatusBar() {
  const [time, setTime] = useState(nowTime);

  useEffect(() => {
    const id = setInterval(() => setTime(nowTime()), 30_000);
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
  streamingText,
  input,
  loading,
  disabled,
  error,
  scrollRef,
  onInputChange,
  onSubmit,
}: {
  phone: string;
  messages: Message[];
  streamingText: string;
  input: string;
  loading: boolean;
  disabled: boolean;
  error: string | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const canSend = input.trim().length > 0 && !loading && !disabled;
  const showStreaming = loading && streamingText.length > 0;

  return (
    <div className="relative mx-auto w-full max-w-[390px]">
      <div className="rounded-[3rem] bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-900 p-3 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
        <div className="absolute -left-[2px] top-28 h-10 w-[3px] rounded-l bg-zinc-600" />
        <div className="absolute -left-[2px] top-44 h-16 w-[3px] rounded-l bg-zinc-600" />
        <div className="absolute -left-[2px] top-64 h-16 w-[3px] rounded-l bg-zinc-600" />
        <div className="absolute -right-[2px] top-36 h-20 w-[3px] rounded-r bg-zinc-600" />

        <div className="relative flex h-[680px] flex-col overflow-hidden rounded-[2.35rem] bg-[#000]">
          <div className="relative flex min-h-0 flex-1 flex-col bg-gradient-to-b from-[#1c1c1e] via-[#0f0f10] to-[#0a0a0b]">
            <StatusBar />

            <div className="flex items-center gap-2 border-b border-white/5 bg-[#1c1c1e]/95 px-3 py-2.5 backdrop-blur-md">
              <ChevronLeft className="h-5 w-5 text-[#0a84ff]" strokeWidth={2.5} />
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 shadow-md">
                  <HeartPulse className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-white">Luma Health</div>
                  <div className="truncate text-[11px] text-zinc-400">{phone || 'Demo SMS line'}</div>
                </div>
              </div>
              <Info className="h-5 w-5 text-[#0a84ff]" strokeWidth={2.5} />
            </div>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.08), transparent 40%), radial-gradient(circle at 80% 0%, rgba(59,130,246,0.08), transparent 35%)',
              }}
            >
              {messages.length === 0 && !showStreaming && (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
                    <HeartPulse className="h-7 w-7 text-emerald-400" />
                  </div>
                  <p className="text-sm font-medium text-zinc-300">Luma Rural Health SMS</p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    Try &quot;I&apos;m not feeling well&quot; — the agent asks for your location
                    (pincode or a description), understands your symptoms, and finds the nearest
                    facility.
                  </p>
                </div>
              )}

              {messages.map((m) => {
                const isUser = m.direction === 'outbound';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[82%] whitespace-pre-wrap px-3.5 py-2 text-[15px] leading-snug shadow-sm ${
                        isUser
                          ? 'rounded-[20px] rounded-br-md bg-[#34c759] text-white'
                          : 'rounded-[20px] rounded-bl-md bg-[#3a3a3c] text-white'
                      }`}
                    >
                      {m.body}
                    </div>
                    {m.time && <span className="mt-1 px-1 text-[10px] text-zinc-500">{m.time}</span>}
                  </div>
                );
              })}

              {showStreaming && (
                <div className="flex flex-col items-start">
                  <div className="max-w-[82%] whitespace-pre-wrap rounded-[20px] rounded-bl-md bg-[#3a3a3c] px-3.5 py-2 text-[15px] leading-snug text-white shadow-sm">
                    {streamingText}
                  </div>
                </div>
              )}

              {loading && !showStreaming && (
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
                    placeholder={disabled ? 'Agent unavailable' : 'Text Message'}
                    disabled={loading || disabled}
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

function IntakeSummaryCard({ bundle }: { bundle: IntakeBundle }) {
  const geo = confidenceLabel(bundle.geoConfidence);
  const fac = confidenceLabel(bundle.facilityConfidence);
  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Intake summary
          {bundle.hasCoverageGap && <Badge variant="destructive">Coverage gap</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        <div>
          <div className="text-muted-foreground">Symptoms</div>
          <div>{bundle.symptomSummary || '—'}</div>
        </div>
        <div>
          <div className="text-muted-foreground flex items-center gap-2">
            Location
            <Badge variant={geo.variant}>{geo.label}</Badge>
          </div>
          <div>{locationText(bundle.chosenLocation)}</div>
        </div>
        <div>
          <div className="text-muted-foreground flex items-center gap-2">
            Nearest facility
            <Badge variant={fac.variant}>{fac.label}</Badge>
          </div>
          {bundle.nearestFacility ? (
            <div>
              <div className="font-medium">{bundle.nearestFacility.name}</div>
              <div className="text-muted-foreground">
                {bundle.nearestFacility.distanceKm != null
                  ? `${Math.round(bundle.nearestFacility.distanceKm)} km`
                  : 'distance unknown'}
                {bundle.nearestFacility.phone ? ` · ${bundle.nearestFacility.phone}` : ''}
              </div>
              {bundle.nearestFacility.specialties && (
                <div className="text-xs text-muted-foreground mt-1">
                  {bundle.nearestFacility.specialties}
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground">No facility matched</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SmsPage() {
  const { agents, defaultAgent } = usePluginClientConfig<AgentsClientConfig>('agents');
  const activeAgent = defaultAgent ?? agents[0] ?? null;

  const phone = '+919876543210';
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [bundle, setBundle] = useState<IntakeBundle | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleEvent = (event: AgentChatEvent) => {
    if (event.item?.type === 'function_call_output') {
      const parsed = parseBundle(event.item.output);
      if (parsed) setBundle(parsed);
    }
  };

  const { content, isStreaming, error, send } = useAgentChat({
    agent: activeAgent ?? '',
    onEvent: handleEvent,
  });

  // When a streamed reply finishes, commit it as an inbound SMS bubble.
  const lastCommitted = useRef('');
  useEffect(() => {
    if (isStreaming) return;
    const text = content.trim();
    if (!text || text === lastCommitted.current) return;
    lastCommitted.current = text;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- commit the finished streamed reply as an inbound SMS bubble once streaming ends
    setMessages((prev) => [
      ...prev,
      { id: `in-${Date.now()}`, direction: 'inbound', body: text, time: nowTime() },
    ]);
  }, [isStreaming, content]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, content, isStreaming]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming || !activeAgent) return;
    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: `out-${Date.now()}`, direction: 'outbound', body: text, time: nowTime() },
    ]);
    void send(text);
  };

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px] max-w-7xl mx-auto">
      <div className="space-y-6">
        <PageHeader
          title="Rural Health SMS"
          subtitle="Simulates SMS for rural users. The intake agent resolves your location from a pincode or a free-text description, asks follow-ups when it's unsure, maps your symptoms, and recommends the nearest suitable facility with confidence scores."
        />

        <PhoneSmsChat
          phone={phone}
          messages={messages}
          streamingText={content}
          input={input}
          loading={isStreaming}
          disabled={!activeAgent}
          error={error ?? null}
          scrollRef={scrollRef}
          onInputChange={setInput}
          onSubmit={sendMessage}
        />
      </div>

      <div className="space-y-4">
        {bundle ? (
          <IntakeSummaryCard bundle={bundle} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Intake summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              The agent builds a confidence-scored summary (location, symptoms, nearest facility)
              once it has enough detail. It will appear here.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
