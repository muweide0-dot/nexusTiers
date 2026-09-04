import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Command,
  Copy,
  Crown,
  ExternalLink,
  Hash,
  LayoutDashboard,
  Loader2,
  Menu,
  Medal,
  MonitorDot,
  Pause,
  Play,
  Plus,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Ticket as TicketIcon,
  Trophy,
  TrendingUp,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  getGetPlayerTiersQueryKey,
  getGetQueueQueryKey,
  getListQueuesQueryKey,
  useApplyWaitlist,
  useCloseQueue,
  useGetPlayerTiers,
  useGetQueue,
  useListActivity,
  useListQueues,
  useNextTicket,
  useOpenQueue,
  useSetupServer,
  useSkipTicket,
  useSubmitResult,
  useVerifyAccount,
} from '@workspace/api-client-react';
import type {
  ActivityItem,
  QueueEntry,
  QueueOverview,
  ResultInputTier,
  Ticket as ApiTicket,
  Tester,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
type Kit = 'uhc' | 'sword' | 'mace' | 'diapot' | 'nethpot' | 'smp' | 'crystal' | 'axe';
const kits: { key: Kit; label: string; short: string; hue: string }[] = [
  { key: 'uhc', label: 'UHC', short: 'UHC', hue: 'hsl(37 88% 61%)' },
  { key: 'sword', label: 'Sword', short: 'SW', hue: 'hsl(191 83% 55%)' },
  { key: 'mace', label: 'Mace', short: 'MC', hue: 'hsl(269 72% 69%)' },
  { key: 'diapot', label: 'Diapot', short: 'DP', hue: 'hsl(1 74% 61%)' },
  { key: 'nethpot', label: 'NethPot', short: 'NP', hue: 'hsl(337 72% 62%)' },
  { key: 'smp', label: 'SMP', short: 'SM', hue: 'hsl(155 72% 48%)' },
  { key: 'crystal', label: 'Crystal', short: 'CX', hue: 'hsl(191 83% 55%)' },
  { key: 'axe', label: 'Axe', short: 'AX', hue: 'hsl(37 88% 61%)' },
];
const actor = { actorId: 'control-room', actorName: 'Nexus Control' };
type LeaderboardRow = {
  rank: number;
  username: string;
  ign: string;
  points: number;
  results: number;
  bestTier: string;
  lastResult: string;
};

const pointRules = [
  { tier: 1, high: 60, low: 45 },
  { tier: 2, high: 30, low: 20 },
  { tier: 3, high: 10, low: 6 },
  { tier: 4, high: 4, low: 3 },
  { tier: 5, high: 2, low: 1 },
  { tier: 6, high: null, low: null },
  { tier: 7, high: null, low: null },
] as const;

function tierNumber(value?: string) {
  const match = value?.match(/([1-7])/);
  return match ? Number(match[1]) : null;
}

function useLeaderboard() {
  return useQuery<LeaderboardRow[]>({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const response = await fetch('/api/leaderboard');
      if (!response.ok) throw new Error('Leaderboard konnte nicht geladen werden.');
      return response.json() as Promise<LeaderboardRow[]>;
    },
    staleTime: 15000,
  });
}



function kitMeta(key?: string) {
  return kits.find((kit) => kit.key === key) ?? kits[0];
}

function timeAgo(value?: string) {
  if (!value) return 'just now';
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function initials(name: string) {
  return name.split(/[\s_-]+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function Button({
  children,
  variant = 'secondary',
  className = '',
  ...props
}: { children: ReactNode; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; className?: string; 'data-testid'?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:brightness-110 shadow-[0_6px_20px_hsl(155_72%_48%_/_0.14)]',
    secondary: 'border border-border bg-secondary text-secondary-foreground hover:bg-[hsl(229_22%_20%)]',
    quiet: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
    danger: 'border border-[hsl(1_74%_61%_/_0.32)] bg-[hsl(1_74%_61%_/_0.10)] text-[hsl(1_74%_74%)] hover:bg-[hsl(1_74%_61%_/_0.18)]',
  };
  return <button data-testid={props['data-testid']} className={`focus-ring inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`} {...props}>{children}</button>;
}

function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'blue' | 'muted' }) {
  const tones = {
    green: 'border-primary/20 bg-primary/10 text-primary',
    amber: 'border-accent/20 bg-accent/10 text-accent',
    red: 'border-destructive/20 bg-destructive/10 text-destructive-foreground',
    blue: 'border-[hsl(191_83%_55%_/_0.24)] bg-[hsl(191_83%_55%_/_0.10)] text-[hsl(191_83%_65%)]',
    muted: 'border-border bg-secondary text-muted-foreground',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${tones[tone]}`}>{children}</span>;
}

function Avatar({ name, hue = 'hsl(155 72% 48%)' }: { name: string; hue?: string }) {
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-[11px] font-semibold text-background" style={{ background: hue }}>{initials(name)}</span>;
}

function LoadingState({ label = 'Syncing control room' }: { label?: string }) {
  return <div className="grid min-h-[240px] place-items-center rounded-xl border border-border bg-card/40"><div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" />{label}...</div></div>;
}

function ErrorState({ onRetry, message = 'The API did not return a response.' }: { onRetry?: () => void; message?: string }) {
  return <div className="grid min-h-[180px] place-items-center rounded-xl border border-destructive/25 bg-destructive/5 p-6 text-center"><div><XCircle className="mx-auto mb-3 h-7 w-7 text-destructive" /><p className="text-sm font-medium">Connection interrupted</p><p className="mt-1 text-xs text-muted-foreground">{message}</p>{onRetry && <Button variant="danger" onClick={onRetry} className="mt-4" data-testid="button-retry"><Zap className="h-3.5 w-3.5" />Try again</Button>}</div></div>;
}

function EmptyState({ icon: Icon = CircleDot, title, description }: { icon?: typeof CircleDot; title: string; description: string }) {
  return <div className="grid min-h-[180px] place-items-center rounded-xl border border-dashed border-border bg-card/30 p-6 text-center"><div><Icon className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="text-sm font-medium">{title}</p><p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p></div></div>;
}

function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className="mb-4 flex items-end justify-between gap-4"><div>{eyebrow && <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}<h2 className="text-lg font-semibold tracking-tight">{title}</h2></div>{action}</div>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const nav = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/players', label: 'Players', icon: Search },
    { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { href: '/setup', label: 'Server setup', icon: Settings2 },
  ];
  return <div className="app-shell min-h-[100dvh] text-foreground">
    <aside className={`fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar/95 px-4 py-5 backdrop-blur-xl transition-transform md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center gap-3 px-2"><div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_0_4px_hsl(155_72%_48%_/_0.10)]"><Command className="h-5 w-5" /></div><div><p className="font-semibold tracking-tight">NexusTiers</p><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">control bridge</p></div></div>
      <div className="mt-9 px-2"><p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Command</p>{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileNav(false)} className={`focus-ring mb-1 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${location === href ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`} data-testid={`link-${label.toLowerCase().replace(/\s/g, '-')}`}><Icon className="h-4 w-4" />{label}{location === href && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}</Link>)}</div>
      <div className="mt-7 px-2"><div className="mb-2 flex items-center justify-between"><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Kit lanes</p><Badge tone="green">8 online</Badge></div>{kits.map((kit) => <Link key={kit.key} href={`/queues/${kit.key}`} onClick={() => setMobileNav(false)} className="focus-ring group mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground" data-testid={`link-queue-${kit.key}`}><span className="grid h-5 w-5 place-items-center rounded border border-white/10 font-mono text-[8px] font-medium" style={{ color: kit.hue }}>{kit.short}</span><span>{kit.label}</span><ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" /></Link>)}</div>
      <div className="mt-auto rounded-lg border border-primary/15 bg-primary/5 p-3"><div className="flex items-center gap-2"><span className="animate-pulse-dot h-2 w-2 rounded-full bg-primary" /><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Discord connected</span></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Nexus relay is listening for queue events.</p></div>
    </aside>
    {mobileNav && <button className="fixed inset-0 z-20 bg-background/70 md:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation" data-testid="button-close-navigation" />}
    <main className="min-h-[100dvh] md:pl-[248px]"><header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/80 px-5 backdrop-blur-xl md:px-8"><div className="flex items-center gap-3"><Button variant="quiet" className="px-2 md:hidden" onClick={() => setMobileNav(true)} data-testid="button-open-navigation"><Menu className="h-5 w-5" /></Button><div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="text-primary">NEXUS</span><span>/</span><span>COMMAND BRIDGE</span></div><div className="flex items-center gap-2 md:hidden"><Command className="h-4 w-4 text-primary" /><span className="font-semibold">NexusTiers</span></div></div><div className="flex items-center gap-4"><div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-primary" />relay 14ms</div><Avatar name="Nexus Control" hue="hsl(191 83% 55%)" /></div></header><div className="mx-auto max-w-[1440px] p-5 md:p-8">{children}</div></main>
  </div>;
}

function Overview() {
  const queues = useListQueues();
  const activity = useListActivity();
  const queueRows = queues.data ?? [];
  const activityRows = activity.data ?? [];
  const openCount = queueRows.filter((queue) => queue.status === 'open').length;
  const playerCount = queueRows.reduce((sum, queue) => sum + queue.count, 0);
  const testerCount = queueRows.reduce((sum, queue) => sum + queue.activeTesters, 0);
  return <div className="animate-rise">
    <div className="grid-texture relative mb-8 overflow-hidden rounded-xl border border-border px-5 py-6 md:px-8 md:py-8"><div className="relative z-[1] max-w-2xl"><div className="mb-4 flex items-center gap-2"><Badge tone="green"><span className="h-1.5 w-1.5 rounded-full bg-primary" />live system</Badge><span className="font-mono text-[10px] text-muted-foreground">UTC {new Date().toISOString().slice(11, 16)}</span></div><h1 className="max-w-xl text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Keep every duel<br /><span className="text-primary">moving forward.</span></h1><p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">The verified command bridge for Minecraft PvP testing. Queue state, ticket handoffs, and tier results in one focused view.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/queues/uhc" className="focus-ring inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110" data-testid="link-open-uhc-queue">Open UHC lane <ArrowRight className="h-4 w-4" /></Link><Link href="/setup" className="focus-ring inline-flex items-center gap-2 rounded-md border border-border bg-card/80 px-4 py-2.5 text-sm font-medium transition hover:bg-secondary" data-testid="link-server-setup">Configure relay</Link><Link href="/leaderboard" className="focus-ring inline-flex items-center gap-2 rounded-md border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent transition hover:bg-accent/15" data-testid="link-leaderboard"><Trophy className="h-4 w-4" />View leaderboard</Link></div></div><div className="absolute -right-16 -top-20 hidden h-80 w-80 rounded-full border border-primary/20 md:block"><div className="absolute inset-8 rounded-full border border-primary/10"><div className="absolute right-12 top-10 h-2 w-2 rounded-full bg-primary shadow-[0_0_20px_hsl(155_72%_48%_/_0.6)]" /></div></div></div>
    <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Open lanes" value={openCount} suffix="/ 8" icon={Activity} tone="green" /><Metric label="Players waiting" value={playerCount} icon={Users} tone="amber" /><Metric label="Testers active" value={testerCount} icon={ShieldCheck} tone="blue" /><Metric label="Relay health" value="14" suffix="ms" icon={MonitorDot} tone="green" /></div>
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.85fr)]"><section><SectionTitle eyebrow="01 / queue matrix" title="All kit lanes" action={<span className="font-mono text-[10px] text-muted-foreground">auto-refresh enabled</span>} />{queues.isLoading ? <LoadingState /> : queues.isError ? <ErrorState onRetry={() => queues.refetch()} /> : queueRows.length === 0 ? <EmptyState icon={Pause} title="No queue lanes found" description="Once the relay is connected, kit lanes will appear here." /> : <div className="grid gap-3 sm:grid-cols-2">{queueRows.map((queue, index) => <QueueCard key={queue.kit} queue={queue} index={index} />)}</div>}</section><section><SectionTitle eyebrow="02 / event stream" title="Recent activity" action={<Activity className="h-4 w-4 text-muted-foreground" />} />{activity.isLoading ? <LoadingState label="Reading activity" /> : activity.isError ? <ErrorState onRetry={() => activity.refetch()} /> : activityRows.length === 0 ? <EmptyState icon={Activity} title="No events yet" description="Queue and ticket handoffs will be recorded here." /> : <ActivityFeed items={activityRows.slice(0, 8)} />}</section></div>
    <div className="mt-8 grid gap-3 md:grid-cols-[1fr_auto]"><div className="rounded-xl border border-border bg-card/70 p-4"><div className="flex items-center gap-3"><Server className="h-4 w-4 text-primary" /><div><p className="text-sm font-medium">Minecraft network bridge</p><p className="mt-0.5 text-xs text-muted-foreground">mc.nexustiers.gg · Paper 1.21.4 · last heartbeat 14 seconds ago</p></div><Badge tone="green" >healthy</Badge></div></div><Link href="/players" className="focus-ring flex items-center justify-center gap-2 rounded-xl border border-border bg-card/70 px-5 py-4 text-sm font-medium hover:bg-secondary" data-testid="link-player-directory">Player directory <ArrowRight className="h-4 w-4 text-primary" /></Link></div>
  </div>;
}

function Metric({ label, value, suffix, icon: Icon, tone }: { label: string; value: string | number; suffix?: string; icon: typeof Activity; tone: 'green' | 'amber' | 'blue' }) {
  const colors = { green: 'text-primary bg-primary/10', amber: 'text-accent bg-accent/10', blue: 'text-[hsl(191_83%_65%)] bg-[hsl(191_83%_55%_/_0.10)]' };
  return <div className="rounded-xl border border-border bg-card/70 p-4 md:p-5"><div className="flex items-center justify-between"><span className={`grid h-8 w-8 place-items-center rounded-md ${colors[tone]}`}><Icon className="h-4 w-4" /></span><span className="font-mono text-[10px] text-muted-foreground">LIVE</span></div><p className="stat-number mt-4 text-2xl font-semibold">{value}<span className="ml-1 text-sm font-normal text-muted-foreground">{suffix}</span></p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}

function QueueCard({ queue, index }: { queue: QueueOverview; index: number }) {
  const meta = kitMeta(queue.kit);
  const percent = queue.max ? Math.min(100, (queue.count / queue.max) * 100) : 0;
  return <Link href={`/queues/${queue.kit}`} className="focus-ring group animate-rise rounded-xl border border-border bg-card/70 p-4 transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card" style={{ animationDelay: `${index * 45}ms` }} data-testid={`card-queue-${queue.kit}`}><div className="flex items-start justify-between"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 font-mono text-[10px] font-medium" style={{ color: meta.hue, background: `${meta.hue.replace(')', ' / .08)')}` }}>{meta.short}</span><div><p className="font-medium">{queue.label}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">#{queue.channelName}</p></div></div><Badge tone={queue.status === 'open' ? 'green' : 'muted'}>{queue.status === 'open' ? 'open' : 'closed'}</Badge></div><div className="mt-5 flex items-end justify-between"><div><span className="stat-number text-2xl font-semibold">{queue.count}</span><span className="text-xs text-muted-foreground"> / {queue.max} waiting</span></div><div className="text-right"><p className="font-mono text-[10px] text-muted-foreground">{queue.activeTesters} testers</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{timeAgo(queue.lastUpdate)}</p></div></div><div className="mt-3 h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: meta.hue }} /></div></Link>;
}

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const kindIcon = { queue: Activity, ticket: TicketIcon, result: CheckCircle2, setup: Settings2, verification: ShieldCheck };
  return <div className="divide-y divide-border rounded-xl border border-border bg-card/60">{items.map((item) => { const Icon = kindIcon[item.kind] ?? Activity; return <div key={item.id} className="flex gap-3 p-4"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground"><Icon className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{item.title}</p><span className="shrink-0 font-mono text-[10px] text-muted-foreground">{timeAgo(item.timestamp)}</span></div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p></div></div>; })}</div>;
}

function PodiumCard({ row }: { row: LeaderboardRow }) {
  const RankIcon = row.rank === 1 ? Crown : row.rank === 2 ? Medal : Trophy;
  return <div className={'podium-card podium-card-' + row.rank + ' rounded-xl border p-4'}><div className="flex items-start justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg bg-background/50 text-accent"><RankIcon className="h-4 w-4" /></span><span className="font-mono text-xs text-muted-foreground">#{String(row.rank).padStart(2, '0')}</span></div><p className="mt-5 truncate text-base font-semibold">{row.ign}</p><p className="mt-1 text-xs text-muted-foreground">{row.username} · Tier {tierNumber(row.bestTier) ?? '—'}</p><div className="mt-4 flex items-end justify-between"><span className="stat-number text-3xl font-semibold text-accent">{row.points}</span><span className="font-mono text-[10px] uppercase text-muted-foreground">points</span></div></div>;
}

function LeaderboardPage() {
  const leaderboard = useLeaderboard();
  const rows = (leaderboard.data ?? []).slice(0, 7);
  return <div className="animate-rise">
    <div className="leaderboard-hero mb-8 overflow-hidden rounded-2xl border border-border p-6 md:p-9"><div className="relative z-[1] flex flex-wrap items-end justify-between gap-6"><div><div className="mb-4 flex items-center gap-2"><Badge tone="amber"><Trophy className="h-3 w-3" />season standings</Badge><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">live ranking</span></div><h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.06em] md:text-6xl">Earn your place<br /><span className="text-accent">above the line.</span></h1><p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">Every verified result adds points. Climb the board, defend your tier, and make the next test count.</p></div><div className="leaderboard-hero-stat"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Scoring model</p><p className="mt-2 text-3xl font-semibold text-foreground">HT / LT</p><p className="mt-1 text-xs text-muted-foreground">higher tier, higher reward</p></div></div></div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><section className="leaderboard-surface rounded-2xl border border-border bg-card/65 p-4 md:p-6"><div className="mb-5 flex items-end justify-between gap-4"><div><p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">01 / top players</p><h2 className="text-xl font-semibold tracking-tight">Leaderboard</h2></div><span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 font-mono text-[10px] text-primary">TOP 07</span></div>{leaderboard.isLoading ? <LoadingState label="Loading standings" /> : leaderboard.isError ? <ErrorState onRetry={() => leaderboard.refetch()} message="The leaderboard is temporarily unavailable." /> : rows.length === 0 ? <EmptyState icon={Trophy} title="No ranked players yet" description="Submit a verified result to create the first leaderboard entry." /> : <><div className="mb-6 grid gap-3 md:grid-cols-3">{rows.slice(0, 3).map((row) => <PodiumCard key={row.ign} row={row} />)}</div><div className="leaderboard-table overflow-hidden rounded-xl border border-border"><div className="leaderboard-row leaderboard-row-head"><span>Rank</span><span>Player</span><span>Tier</span><span>Tests</span><span className="text-right">Points</span></div>{rows.map((row) => <div className="leaderboard-row" key={row.ign}><span className={'rank-number rank-' + row.rank}>{String(row.rank).padStart(2, '0')}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{row.ign}</p><p className="truncate text-[11px] text-muted-foreground">{row.username}</p></div><span className="tier-pill">Tier {tierNumber(row.bestTier) ?? '—'}</span><span className="text-xs text-muted-foreground">{row.results} result{row.results === 1 ? '' : 's'}</span><span className="text-right font-mono text-sm font-semibold text-accent">{row.points} pts</span></div>)}</div></>}</section><aside className="space-y-5"><section className="points-card rounded-2xl border border-border bg-card/70 p-5 md:p-6"><div className="mb-5 flex items-start justify-between"><div><p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">02 / point system</p><h2 className="text-xl font-semibold">Trophy tiers</h2></div><TrendingUp className="h-5 w-5 text-accent" /></div><div className="space-y-2">{pointRules.map((rule) => <div className="point-rule" key={rule.tier}><div className="flex items-center gap-3"><span className="point-trophy"><Trophy className="h-3.5 w-3.5" /></span><span className="text-sm font-medium">Trophy Tier {rule.tier}</span></div><div className="flex items-center gap-3 font-mono text-[10px]"><span className="text-foreground">{rule.high === null ? '—' : String(rule.high) + ' pts'}</span><span className="text-muted-foreground">{rule.low === null ? '—' : String(rule.low) + ' pts'}</span></div></div>)}</div><p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">HT earns the first value. LT earns the second value. Tier 6 and 7 are ready for your future scoring rules.</p></section><section className="rounded-2xl border border-primary/15 bg-primary/5 p-5"><div className="flex items-center gap-2 text-primary"><ShieldCheck className="h-4 w-4" /><p className="text-sm font-medium">Earn points through testing</p></div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">Complete a verified kit test and your best result is reflected here automatically.</p><Link href="/players" className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline">Find a player <ArrowRight className="h-3.5 w-3.5" /></Link></section></aside></div>
  </div>;
}

function QueuePage() {
  const params = useParams<{ kit: string }>();
  const kit = (params.kit ?? 'uhc') as Kit;
  const meta = kitMeta(kit);
  const queue = useGetQueue(kit, { query: { queryKey: getGetQueueQueryKey(kit) } });
  const queryClient = useQueryClient();
  const [flash, setFlash] = useState('');
  const open = useOpenQueue();
  const close = useCloseQueue();
  const next = useNextTicket();
  const skip = useSkipTicket();
  const busy = open.isPending || close.isPending || next.isPending || skip.isPending;
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: getGetQueueQueryKey(kit) }); void queryClient.invalidateQueries({ queryKey: getListQueuesQueryKey() }); };
  const action = (fn: { mutate: Function }, label: string) => fn.mutate({ kit, data: actor }, { onSuccess: () => { setFlash(label); refresh(); }, onError: (error: unknown) => setFlash(error instanceof Error ? error.message : 'Action failed') });
  const detail = queue.data;
  return <div className="animate-rise"><div className="mb-7 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Link href="/" className="focus-ring hover:text-foreground" data-testid="link-back-overview">Overview</Link><ChevronRight className="h-3.5 w-3.5" /><span className="text-foreground">{meta.label} lane</span></div>{queue.isLoading ? <LoadingState label={`Loading ${meta.label} lane`} /> : queue.isError || !detail ? <ErrorState onRetry={() => queue.refetch()} /> : <><div className="mb-7 flex flex-wrap items-end justify-between gap-5"><div><div className="mb-3 flex items-center gap-2"><span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: meta.hue }}>KIT 0{kits.findIndex((k) => k.key === kit) + 1}</span><Badge tone={detail.status === 'open' ? 'green' : 'muted'}>{detail.status}</Badge></div><h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">{detail.label} <span className="text-muted-foreground">queue</span></h1><p className="mt-2 text-sm text-muted-foreground">#{detail.kit}-waitlist · updated {timeAgo(detail.lastUpdate)}</p></div><div className="flex flex-wrap gap-2">{detail.status === 'open' ? <Button variant="danger" onClick={() => action(close, 'Queue closed')} disabled={busy} data-testid="button-close-queue"><Pause className="h-3.5 w-3.5" />Close queue</Button> : <Button variant="primary" onClick={() => action(open, 'Queue opened')} disabled={busy} data-testid="button-open-queue"><Play className="h-3.5 w-3.5" />Open queue</Button>}<Button variant="primary" onClick={() => action(next, 'Next ticket created')} disabled={busy || detail.count === 0} data-testid="button-next-ticket"><TicketIcon className="h-3.5 w-3.5" />Next ticket</Button></div></div>{flash && <div className={`mb-5 flex items-center gap-2 rounded-md border p-3 text-xs ${flash.includes('failed') || flash.includes('Error') ? 'border-destructive/25 bg-destructive/5 text-destructive-foreground' : 'border-primary/25 bg-primary/5 text-primary'}`}><CheckCircle2 className="h-4 w-4" />{flash}<button className="ml-auto" onClick={() => setFlash('')} data-testid="button-dismiss-feedback"><X className="h-3.5 w-3.5" /></button></div>}<div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4"><Metric label="In waitlist" value={detail.count} suffix={`/ ${detail.max}`} icon={Users} tone="amber" /><Metric label="Active testers" value={detail.activeTesters.length} icon={ShieldCheck} tone="green" /><Metric label="Queue mode" value={detail.status === 'open' ? 'ON' : 'OFF'} icon={detail.status === 'open' ? Play : Pause} tone="blue" /><Metric label="Current ticket" value={detail.currentTicket ? '#1' : '—'} icon={TicketIcon} tone="green" /></div><div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]"><section><SectionTitle eyebrow="01 / numbered waitlist" title="Players in lane" action={<span className="font-mono text-[10px] text-muted-foreground">FIFO priority</span>} />{detail.entries.length === 0 ? <EmptyState icon={Users} title="Lane is clear" description="Verified players who apply through Discord will line up here." /> : <div className="overflow-hidden rounded-xl border border-border bg-card/60"><div className="hidden grid-cols-[48px_1.4fr_1fr_90px_100px_42px] gap-3 border-b border-border bg-secondary/45 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground md:grid"><span>#</span><span>Player</span><span>Discord</span><span>Tier</span><span>Region</span><span /></div>{detail.entries.map((entry, index) => <QueueEntryRow key={entry.id} entry={entry} index={index} />)}</div>}</section><aside className="space-y-5"><CurrentTicket ticket={detail.currentTicket} kit={kit} onSkip={() => action(skip, 'Ticket skipped')} busy={busy} /><TesterRoster testers={detail.activeTesters} /></aside></div></>}</div>;
}

function QueueEntryRow({ entry, index }: { entry: QueueEntry; index: number }) {
  return <div className="grid gap-3 border-b border-border px-4 py-3.5 last:border-b-0 md:grid-cols-[48px_1.4fr_1fr_90px_100px_42px] md:items-center"><div className="font-mono text-sm text-muted-foreground">{String(entry.position ?? index + 1).padStart(2, '0')}</div><div className="flex items-center gap-3"><Avatar name={entry.ign} hue={index % 2 ? 'hsl(191 83% 55%)' : 'hsl(37 88% 61%)'} /><div><p className="text-sm font-medium">{entry.ign}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{entry.server || 'unknown server'}</p></div></div><p className="text-xs text-muted-foreground"><span className="mr-1 md:hidden">Discord ·</span>{entry.username}</p><Badge tone="amber">{entry.currentTier || 'N/A'}</Badge><p className="text-xs text-muted-foreground">{entry.region} <span className="ml-1 font-mono text-[9px] text-muted-foreground/70">{timeAgo(entry.joinedAt)}</span></p><Link href={`/players?ign=${encodeURIComponent(entry.ign)}`} className="focus-ring hidden justify-self-end rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-primary md:inline-flex" data-testid={`link-player-${entry.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link></div>;
}

function CurrentTicket({ ticket, kit, onSkip, busy }: { ticket: ApiTicket | null; kit: Kit; onSkip: () => void; busy: boolean }) {
  if (!ticket) return <div className="rounded-xl border border-dashed border-border bg-card/45 p-5"><div className="mb-4 flex items-center gap-2"><TicketIcon className="h-4 w-4 text-muted-foreground" /><p className="text-sm font-medium">Current handoff</p></div><EmptyState icon={TicketIcon} title="No active ticket" description="Call the next verified player when your tester is ready." /></div>;
  return <div className="glass-panel rounded-xl border border-primary/25 p-5"><div className="mb-5 flex items-start justify-between"><div><div className="flex items-center gap-2"><span className="animate-pulse-dot h-2 w-2 rounded-full bg-primary" /><span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Live ticket</span></div><p className="mt-2 font-mono text-xs text-muted-foreground">{ticket.id}</p></div><Badge tone="green">{ticket.status}</Badge></div><div className="mb-5 flex items-center gap-3"><Avatar name={ticket.player.ign} hue={kitMeta(kit).hue} /><div><p className="font-medium">{ticket.player.ign}</p><p className="text-xs text-muted-foreground">{ticket.player.username} · {ticket.player.region}</p></div></div><div className="grid grid-cols-2 gap-2 border-y border-border py-3"><div><p className="font-mono text-[9px] uppercase text-muted-foreground">Tester</p><p className="mt-1 text-sm">{ticket.tester.username}</p></div><div><p className="font-mono text-[9px] uppercase text-muted-foreground">Opened</p><p className="mt-1 text-sm">{timeAgo(ticket.openedAt)}</p></div></div><div className="mt-4 flex gap-2"><Button variant="primary" className="flex-1" onClick={() => { const channel = document.querySelector(`[data-testid=\"button-submit-result-${ticket.id}\"]`) as HTMLElement | null; channel?.click(); }} data-testid="button-result-ticket"><Check className="h-3.5 w-3.5" />Submit result</Button><Button variant="danger" onClick={onSkip} disabled={busy} data-testid="button-skip-ticket"><SkipForward className="h-3.5 w-3.5" />Skip</Button></div><ResultForm ticket={ticket} kit={kit} /></div>;
}

function ResultForm({ ticket, kit }: { ticket: ApiTicket; kit: Kit }) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<ResultInputTier>('N/A');
  const [error, setError] = useState('');
  const submit = useSubmitResult();
  if (!open) return <button className="hidden" onClick={() => setOpen(true)} data-testid={`button-submit-result-${ticket.id}`}>open</button>;
  return <div className="mt-4 border-t border-border pt-4"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-medium">Record tier result</p><button className="text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)} data-testid="button-close-result"><X className="h-4 w-4" /></button></div><select value={tier} onChange={(event) => setTier(event.target.value as ResultInputTier)} className="focus-ring w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm" data-testid="select-result-tier">{['N/A', 'lt5', 'ht5', 'lt4', 'ht4', 'lt3', 'ht3', 'lt2', 'ht2', 'lt1', 'ht1'].map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select>{error && <p className="mt-2 text-xs text-destructive-foreground">{error}</p>}<Button variant="primary" className="mt-3 w-full" disabled={submit.isPending} onClick={() => submit.mutate({ data: { playerDiscordUserId: ticket.player.discordUserId, playerUsername: ticket.player.username, ign: ticket.player.ign, kit, tier, testerId: ticket.tester.discordUserId, testerName: ticket.tester.username, previousTier: ticket.player.currentTier, region: ticket.player.region } }, { onSuccess: () => setError('Result submitted to Discord'), onError: () => setError('Could not submit this result') })} data-testid="button-confirm-result">{submit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} {submit.isPending ? 'Submitting' : 'Confirm result'}</Button></div>;
}

function TesterRoster({ testers }: { testers: Tester[] }) {
  return <div className="rounded-xl border border-border bg-card/60 p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><p className="text-sm font-medium">Active testers</p></div><span className="font-mono text-xs text-muted-foreground">{testers.length}/4</span></div>{testers.length === 0 ? <p className="rounded-md bg-secondary/60 p-3 text-xs leading-relaxed text-muted-foreground">No testers have claimed this lane yet.</p> : <div className="space-y-3">{testers.map((tester) => <div key={tester.discordUserId} className="flex items-center gap-3"><Avatar name={tester.username} hue="hsl(155 72% 48%)" /><div className="min-w-0 flex-1"><p className="truncate text-sm">{tester.username}</p><p className="font-mono text-[10px] text-muted-foreground">{tester.region} region</p></div><span className="h-1.5 w-1.5 rounded-full bg-primary" /></div>)}</div>}</div>;
}

function PlayersPage() {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const player = useGetPlayerTiers(submitted || 'lookup', { query: { enabled: !!submitted, queryKey: getGetPlayerTiersQueryKey(submitted || 'lookup') } });
  const apply = useApplyWaitlist();
  const verify = useVerifyAccount();
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [discordId, setDiscordId] = useState('');
  const [discordName, setDiscordName] = useState('');
  const [kit, setKit] = useState<Kit>('uhc');
  const [region, setRegion] = useState('NA');
  const [server, setServer] = useState('NA-01');
  const submitSearch = (event: React.FormEvent) => { event.preventDefault(); setSubmitted(input.trim()); };
  return <div className="animate-rise"><div className="mb-8"><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Player intelligence</p><h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Find a player.</h1><p className="mt-2 text-sm text-muted-foreground">Verify an IGN, inspect every tier result, or place a verified account into a live lane.</p></div><form onSubmit={submitSearch} className="mb-8 flex max-w-2xl gap-2"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Minecraft IGN, e.g. ClutchTheory" className="focus-ring w-full rounded-md border border-input bg-card px-10 py-3 text-sm outline-none placeholder:text-muted-foreground" data-testid="input-player-search" /></div><Button variant="primary" type="submit" disabled={!input.trim()} data-testid="button-search-player"><Search className="h-4 w-4" />Lookup</Button></form>{submitted && player.isLoading && <LoadingState label={`Looking up ${submitted}`} />}{submitted && player.isError && <ErrorState onRetry={() => player.refetch()} message="No profile was found or the player service is unavailable." />}{submitted && player.data && <PlayerProfileCard profile={player.data} onApply={() => setFormOpen(true)} />}{!submitted && <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]"><div className="grid-texture rounded-xl border border-border p-6 md:p-8"><div className="max-w-md"><span className="mb-5 grid h-10 w-10 place-items-center rounded-lg bg-accent/10 text-accent"><BarChart3 className="h-5 w-5" /></span><h2 className="text-xl font-semibold">One history, every kit.</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Search any Minecraft IGN to surface verified identity, best tier, and the exact tester handoff behind each result.</p></div></div><div className="rounded-xl border border-border bg-card/60 p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Verification protocol</p><div className="mt-5 space-y-4"><ProtocolStep number="01" icon={Search} title="Search the IGN" /><ProtocolStep number="02" icon={ShieldCheck} title="Verify Discord identity" /><ProtocolStep number="03" icon={TicketIcon} title="Apply to a kit lane" /></div></div></div>}{formOpen && player.data && <WaitlistDialog profile={player.data} kit={kit} setKit={setKit} region={region} setRegion={setRegion} server={server} setServer={setServer} discordId={discordId} setDiscordId={setDiscordId} discordName={discordName} setDiscordName={setDiscordName} apply={apply} verify={verify} close={() => setFormOpen(false)} setMessage={setMessage} />}{message && <div className="mt-4 rounded-md border border-primary/25 bg-primary/5 p-3 text-xs text-primary">{message}</div>}</div>;
}

function ProtocolStep({ number, icon: Icon, title }: { number: string; icon: typeof Search; title: string }) {
  return <div className="flex items-center gap-3"><span className="font-mono text-[10px] text-primary">{number}</span><span className="grid h-7 w-7 place-items-center rounded-md bg-secondary text-muted-foreground"><Icon className="h-3.5 w-3.5" /></span><span className="text-sm">{title}</span></div>;
}

function PlayerProfileCard({ profile, onApply }: { profile: { ign: string; username: string; bestTier: string; tiers: { id: string; kit: string; tier: string; previousTier: string; testerName: string; createdAt: string; discordMessage?: string }[] }; onApply: () => void }) {
  return <div className="rounded-xl border border-border bg-card/70"><div className="flex flex-wrap items-center justify-between gap-5 border-b border-border p-5 md:p-6"><div className="flex items-center gap-4"><Avatar name={profile.ign} hue="hsl(37 88% 61%)" /><div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold">{profile.ign}</h2><Badge tone="green"><ShieldCheck className="h-3 w-3" />verified</Badge></div><p className="mt-1 text-sm text-muted-foreground">{profile.username} · player profile</p></div></div><div className="flex items-center gap-5"><div className="text-right"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Best tier</p><p className="mt-1 text-2xl font-semibold text-accent">{profile.bestTier}</p></div><Button variant="primary" onClick={onApply} data-testid="button-apply-player"><Plus className="h-4 w-4" />Apply to queue</Button></div></div><div className="p-5 md:p-6"><SectionTitle eyebrow="tier history" title={`${profile.tiers.length} recorded results`} />{profile.tiers.length === 0 ? <EmptyState icon={BarChart3} title="No results recorded" description="This account is verified, but no tester has submitted a tier yet." /> : <div className="overflow-x-auto"><div className="min-w-[620px] divide-y divide-border rounded-lg border border-border">{profile.tiers.map((result) => <div key={result.id} className="grid grid-cols-[1fr_90px_100px_1fr_100px] items-center gap-3 px-4 py-3"><div><p className="text-sm font-medium">{kitMeta(result.kit).label}</p><p className="text-[10px] text-muted-foreground">{result.discordMessage || 'Discord result logged'}</p></div><Badge tone="amber">{result.tier}</Badge><div className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowRight className="h-3 w-3" />{result.previousTier}</div><p className="text-xs text-muted-foreground">tested by <span className="text-foreground">{result.testerName}</span></p><p className="text-right font-mono text-[10px] text-muted-foreground">{timeAgo(result.createdAt)}</p></div>)}</div></div>}</div></div>;
}

function WaitlistDialog({ profile, kit, setKit, region, setRegion, server, setServer, discordId, setDiscordId, discordName, setDiscordName, apply, verify, close, setMessage }: { profile: { ign: string; username: string }; kit: Kit; setKit: (value: Kit) => void; region: string; setRegion: (value: string) => void; server: string; setServer: (value: string) => void; discordId: string; setDiscordId: (value: string) => void; discordName: string; setDiscordName: (value: string) => void; apply: ReturnType<typeof useApplyWaitlist>; verify: ReturnType<typeof useVerifyAccount>; close: () => void; setMessage: (value: string) => void }) {
  const submit = () => verify.mutate({ data: { discordUserId: discordId, username: discordName, ign: profile.ign } }, { onSuccess: () => apply.mutate({ data: { discordUserId: discordId, username: discordName, ign: profile.ign, currentTier: 'N/A', region, server, kit } }, { onSuccess: () => { setMessage(`${profile.ign} verified and added to ${kitMeta(kit).label}.`); close(); }, onError: () => setMessage('Verified, but the waitlist application could not be placed.') }), onError: () => setMessage('Discord verification failed. Check the identity details and try again.') });
  return <div className="fixed inset-0 z-40 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl md:p-6"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Queue application</p><h2 className="mt-2 text-xl font-semibold">{profile.ign}</h2></div><button className="text-muted-foreground hover:text-foreground" onClick={close} data-testid="button-close-waitlist"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-3"><Field label="Discord user ID"><input value={discordId} onChange={(event) => setDiscordId(event.target.value)} placeholder="123456789012345678" className="field-input" data-testid="input-discord-id" /></Field><Field label="Discord username"><input value={discordName} onChange={(event) => setDiscordName(event.target.value)} placeholder="tester.name" className="field-input" data-testid="input-discord-username" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Kit"><select value={kit} onChange={(event) => setKit(event.target.value as Kit)} className="field-input" data-testid="select-apply-kit">{kits.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></Field><Field label="Region"><select value={region} onChange={(event) => setRegion(event.target.value)} className="field-input" data-testid="select-apply-region">{['NA', 'EU', 'AS', 'OC'].map((item) => <option key={item}>{item}</option>)}</select></Field></div><Field label="Server"><input value={server} onChange={(event) => setServer(event.target.value)} className="field-input" data-testid="input-apply-server" /></Field></div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">This calls verification first, then places the verified identity at the end of the selected Discord waitlist.</p><Button variant="primary" className="mt-5 w-full" disabled={!discordId || !discordName || verify.isPending || apply.isPending} onClick={submit} data-testid="button-confirm-waitlist">{verify.isPending || apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Verify and apply</Button></div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs text-muted-foreground">{label}{children}</label>;
}

function SetupPage() {
  const setup = useSetupServer();
  const [guildId, setGuildId] = useState('');
  const [actorId, setActorId] = useState('');
  const [message, setMessage] = useState('');
  const runSetup = () => setup.mutate({ data: { guildId, actorId } }, { onSuccess: (result) => setMessage(result.message), onError: () => setMessage('Setup could not complete. Confirm the bot has Manage Channels and Manage Roles permissions.') });
  return <div className="animate-rise"><div className="mb-8"><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Relay configuration</p><h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Make Discord the front door.</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">NexusTiers mirrors the live control room into your server. Create the category, kit channels, and tester roles in one deliberate pass.</p></div><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"><section className="rounded-xl border border-border bg-card/70 p-5 md:p-7"><div className="mb-6 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Settings2 className="h-4 w-4" /></span><div><h2 className="font-semibold">Server bootstrap</h2><p className="text-xs text-muted-foreground">Requires a connected NexusTiers bot</p></div></div><div className="grid gap-4"><Field label="Discord server ID"><input value={guildId} onChange={(event) => setGuildId(event.target.value)} placeholder="Your server's ID" className="field-input" data-testid="input-guild-id" /></Field><Field label="Setup actor ID"><input value={actorId} onChange={(event) => setActorId(event.target.value)} placeholder="Admin Discord user ID" className="field-input" data-testid="input-setup-actor" /></Field></div><div className="mt-6 rounded-lg border border-border bg-secondary/40 p-4"><p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-primary" />Permission check</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">The bot needs Manage Channels, Manage Roles, and Send Messages. Existing NexusTiers channels are detected and left untouched.</p></div><Button variant="primary" className="mt-6 w-full sm:w-auto" disabled={!guildId || !actorId || setup.isPending} onClick={runSetup} data-testid="button-run-setup">{setup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Provision Discord server</Button>{message && <div className="mt-4 flex items-start gap-2 rounded-md border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed text-primary"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>}</section><aside className="space-y-4"><div className="rounded-xl border border-border bg-card/60 p-5"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Will be created</p><div className="mt-4 space-y-3">{['nexustiers / category', ...kits.slice(0, 4).map((kit) => `# ${kit.key}-waitlist`), 'tester / verified roles'].map((item, index) => <div key={item} className="flex items-center gap-3 text-sm"><span className="grid h-6 w-6 place-items-center rounded bg-secondary font-mono text-[9px] text-primary">{String(index + 1).padStart(2, '0')}</span><span className={item.startsWith('#') ? 'font-mono text-xs text-muted-foreground' : ''}>{item}</span></div>)}</div><p className="mt-4 text-[10px] text-muted-foreground">+ remaining kit lanes</p></div><div className="rounded-xl border border-accent/20 bg-accent/5 p-5"><div className="flex items-center gap-2 text-accent"><Hash className="h-4 w-4" /><p className="text-sm font-medium">Recommended channel topic</p></div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">“Verified waitlist. Join once, stay ready, respond when pinged.”</p><button className="mt-3 inline-flex items-center gap-2 text-xs text-accent hover:underline" onClick={() => navigator.clipboard?.writeText('Verified waitlist. Join once, stay ready, respond when pinged.')} data-testid="button-copy-topic"><Copy className="h-3.5 w-3.5" />Copy topic</button></div></aside></div></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch><Route path="/" component={Overview} /><Route path="/leaderboard" component={LeaderboardPage} /><Route path="/queues/:kit" component={QueuePage} /><Route path="/players" component={PlayersPage} /><Route path="/setup" component={SetupPage} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;