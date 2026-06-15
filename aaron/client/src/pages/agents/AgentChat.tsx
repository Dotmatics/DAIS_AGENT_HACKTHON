import { useEffect, useRef, useState } from 'react';
import {
  type AgentChatEvent,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  useAgentChat,
  usePluginClientConfig,
} from '@databricks/appkit-ui/react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
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

function confidenceLabel(score: number): { label: string; variant: 'default' | 'secondary' | 'destructive' } {
  if (score >= 0.8) return { label: `High (${Math.round(score * 100)}%)`, variant: 'default' };
  if (score >= 0.55) return { label: `Medium (${Math.round(score * 100)}%)`, variant: 'secondary' };
  return { label: `Low (${Math.round(score * 100)}%)`, variant: 'destructive' };
}

function locationText(loc: IntakeBundle['chosenLocation']): string {
  if (!loc) return 'Not resolved';
  return [loc.officename, loc.district, loc.state].filter(Boolean).join(', ') +
    (loc.pincode ? ` (${loc.pincode})` : '');
}

function IntakeSummaryCard({ bundle }: { bundle: IntakeBundle }) {
  const geo = confidenceLabel(bundle.geoConfidence);
  const fac = confidenceLabel(bundle.facilityConfidence);
  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Intake summary
          {bundle.hasCoverageGap && (
            <Badge variant="destructive">Coverage gap</Badge>
          )}
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

/**
 * Shape of the agents plugin's `clientConfig()` payload — exposed by
 * the agents plugin at server startup and inlined into the boot HTML
 * via `<script id="__appkit__">`. Read with `usePluginClientConfig` so
 * the page doesn't need a separate `GET /api/agents/info` round-trip.
 */
interface AgentsClientConfig {
  agents: string[];
  defaultAgent: string | null;
}

/**
 * Minimal chat surface for the `agents` plugin.
 *
 * The template ships a single coordinator agent and uses the agents
 * plugin's sub-agent feature to compose two authoring forms behind it:
 *
 *   - `planner` (markdown, `config/agents/planner/agent.md`) is the
 *     user-facing chat: pure prose, no tools, opinionated planning
 *     prompt. Declares `agents: [helper]` in its frontmatter so it
 *     can delegate computational actions.
 *   - `helper` (code, `server/agents/helper.ts`) holds the tools
 *     (`current_time`, `count_words`). It's reachable from planner as
 *     the `agent-helper` tool; planner calls it when the user
 *     explicitly asks for a side-effecty action.
 *
 * The page renders one chat against the default agent (planner). To
 * show a picker, drop in more registered top-level agents and add a
 * tab list reading from `agents` below. Today's two-agents-one-tab
 * shape is deliberate: it demonstrates the dual-form composition
 * pattern without confusing scaffolded users with redundant tabs.
 */
export function AgentChat() {
  // Agent registry comes from the agents plugin's `clientConfig()` payload
  // (boot-time, no fetch). `defaultAgent` is null only when no agents are
  // registered; both `planner` and `helper` are registered here.
  const { agents, defaultAgent } =
    usePluginClientConfig<AgentsClientConfig>('agents');
  const activeAgent = defaultAgent ?? agents[0] ?? null;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [bundle, setBundle] = useState<IntakeBundle | null>(null);
  const [pendingAssistantId, setPendingAssistantId] = useState<string | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Surface tool-call events as inline rows, and capture the final intake
  // bundle from `build_intake_bundle`'s output to render the summary card.
  const handleEvent = (event: AgentChatEvent) => {
    if (
      event.type === 'response.output_item.added' &&
      event.item?.type === 'function_call' &&
      event.item.name
    ) {
      setMessages((prev) => [
        ...prev,
        {
          id: `t-${Date.now()}-${Math.random()}`,
          role: 'tool',
          toolName: event.item?.name,
          content: event.item?.arguments ?? '',
        },
      ]);
    }

    if (event.item?.type === 'function_call_output') {
      const parsed = parseBundle(event.item.output);
      if (parsed) setBundle(parsed);
    }
  };

  const { content, isStreaming, error, send } = useAgentChat({
    agent: activeAgent ?? '',
    onEvent: handleEvent,
  });

  // Mirror the streaming `content` into the pending assistant message so
  // tool-call rows interleave correctly with deltas.
  useEffect(() => {
    if (!pendingAssistantId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror streaming deltas into the pending assistant message
    setMessages((prev) =>
      prev.map((m) =>
        m.id === pendingAssistantId ? { ...m, content } : m,
      ),
    );
  }, [content, pendingAssistantId]);

  // Auto-scroll to bottom when messages or the streaming assistant
  // content change — keeps the newest line in view during a long reply.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, content]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || isStreaming || !activeAgent) return;

    setInput('');

    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: message },
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setPendingAssistantId(assistantId);

    await send(message);
    setPendingAssistantId(null);
  };

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Agent Chat</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Talk to the <code className="mx-1">intake</code> agent. It resolves your location from a
          pincode or a description, asks follow-ups when unsure, finds the nearest suitable
          facility, and produces a confidence-scored intake summary.
        </p>
      </div>

      <Card className="h-[min(600px,70vh)] flex flex-col">
        <CardContent
          className="flex-1 overflow-y-auto p-4 space-y-3"
          ref={scrollRef}
        >
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center mt-8">
              Try: &quot;I&apos;m not feeling well&quot; — or &quot;I&apos;m near Film Nagar in
              Hyderabad with chest pain&quot;
            </p>
          )}
          {messages.map((m) => {
            if (m.role === 'tool') {
              return (
                <div
                  key={m.id}
                  className="text-xs font-mono text-muted-foreground border-l-2 border-primary/50 pl-3"
                >
                  <span className="font-semibold">tool · {m.toolName}</span>
                  {m.content ? <span className="ml-2">{m.content}</span> : null}
                </div>
              );
            }
            return (
              <div
                key={m.id}
                className={`p-3 rounded-md ${
                  m.role === 'user'
                    ? 'bg-primary/10 ml-12'
                    : 'bg-muted mr-12'
                }`}
              >
                <div className="text-xs text-muted-foreground mb-1">
                  {m.role}
                </div>
                <div className="whitespace-pre-wrap text-sm">
                  {m.content || (isStreaming ? '…' : '')}
                </div>
              </div>
            );
          })}
        </CardContent>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="p-3 border-t flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              activeAgent
                ? `Message ${activeAgent}…`
                : 'No agents registered'
            }
            disabled={!activeAgent || isStreaming}
          />
          <Button
            type="submit"
            disabled={!input.trim() || !activeAgent || isStreaming}
          >
            {isStreaming ? 'Sending…' : 'Send'}
          </Button>
        </form>
      </Card>

      {bundle && <IntakeSummaryCard bundle={bundle} />}

      {error && <div className="text-sm text-destructive">Error: {error}</div>}
    </div>
  );
}
