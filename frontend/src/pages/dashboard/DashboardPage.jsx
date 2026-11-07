import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  CircleDot,
  Clock,
  Eye,
  UserCog,
  Users,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useDashboardOverview } from '@/hooks/useDashboard'
import { cn } from '@/lib/utils'

/**
 * intensity:
 * - strong (~70%): top summary cards — richer fill, light text
 * - soft (~20%): bottom status cards — airy tint, colored value
 */
const CARD_TONES = {
  azure: {
    strong: {
      shell: 'border-blue-500/30 bg-gradient-to-br from-blue-500 to-blue-600',
      accent: 'border-l-blue-300',
      label: 'text-blue-100',
      value: 'text-white',
      hint: 'text-blue-100/85',
      iconWrap: 'bg-white/20 text-white ring-1 ring-white/30',
    },
    soft: {
      shell: 'border-blue-100 bg-gradient-to-br from-blue-50/80 to-white',
      accent: 'border-l-blue-400',
      label: 'text-slate-500',
      value: 'text-blue-700',
      hint: 'text-slate-400',
      iconWrap: 'bg-blue-100/80 text-blue-600 ring-1 ring-blue-200',
    },
  },
  mint: {
    strong: {
      shell: 'border-teal-500/30 bg-gradient-to-br from-teal-500 to-teal-600',
      accent: 'border-l-teal-300',
      label: 'text-teal-100',
      value: 'text-white',
      hint: 'text-teal-100/85',
      iconWrap: 'bg-white/20 text-white ring-1 ring-white/30',
    },
    soft: {
      shell: 'border-teal-100 bg-gradient-to-br from-teal-50/80 to-white',
      accent: 'border-l-teal-400',
      label: 'text-slate-500',
      value: 'text-teal-700',
      hint: 'text-slate-400',
      iconWrap: 'bg-teal-100/80 text-teal-600 ring-1 ring-teal-200',
    },
  },
  sage: {
    strong: {
      shell: 'border-emerald-500/30 bg-gradient-to-br from-emerald-500 to-emerald-600',
      accent: 'border-l-emerald-300',
      label: 'text-emerald-100',
      value: 'text-white',
      hint: 'text-emerald-100/85',
      iconWrap: 'bg-white/20 text-white ring-1 ring-white/30',
    },
    soft: {
      shell: 'border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white',
      accent: 'border-l-emerald-400',
      label: 'text-slate-500',
      value: 'text-emerald-700',
      hint: 'text-slate-400',
      iconWrap: 'bg-emerald-100/80 text-emerald-600 ring-1 ring-emerald-200',
    },
  },
  lilac: {
    strong: {
      shell: 'border-violet-500/30 bg-gradient-to-br from-violet-500 to-violet-600',
      accent: 'border-l-violet-300',
      label: 'text-violet-100',
      value: 'text-white',
      hint: 'text-violet-100/85',
      iconWrap: 'bg-white/20 text-white ring-1 ring-white/30',
    },
    soft: {
      shell: 'border-violet-100 bg-gradient-to-br from-violet-50/80 to-white',
      accent: 'border-l-violet-400',
      label: 'text-slate-500',
      value: 'text-violet-700',
      hint: 'text-slate-400',
      iconWrap: 'bg-violet-100/80 text-violet-600 ring-1 ring-violet-200',
    },
  },
  sky: {
    soft: {
      shell: 'border-sky-100 bg-gradient-to-br from-sky-50/80 to-white',
      accent: 'border-l-sky-400',
      label: 'text-slate-500',
      value: 'text-sky-700',
      hint: 'text-slate-400',
      iconWrap: 'bg-sky-100/80 text-sky-600 ring-1 ring-sky-200',
    },
  },
  blush: {
    soft: {
      shell: 'border-rose-100 bg-gradient-to-br from-rose-50/80 to-white',
      accent: 'border-l-rose-400',
      label: 'text-slate-500',
      value: 'text-rose-700',
      hint: 'text-slate-400',
      iconWrap: 'bg-rose-100/80 text-rose-600 ring-1 ring-rose-200',
    },
  },
  apricot: {
    soft: {
      shell: 'border-amber-100 bg-gradient-to-br from-amber-50/80 to-white',
      accent: 'border-l-amber-400',
      label: 'text-slate-500',
      value: 'text-amber-700',
      hint: 'text-slate-400',
      iconWrap: 'bg-amber-100/80 text-amber-600 ring-1 ring-amber-200',
    },
  },
  iris: {
    soft: {
      shell: 'border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white',
      accent: 'border-l-indigo-400',
      label: 'text-slate-500',
      value: 'text-indigo-700',
      hint: 'text-slate-400',
      iconWrap: 'bg-indigo-100/80 text-indigo-600 ring-1 ring-indigo-200',
    },
  },
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'azure',
  intensity = 'soft',
  loading,
}) {
  const palette = CARD_TONES[tone] || CARD_TONES.azure
  const t = palette[intensity] || palette.soft || CARD_TONES.azure.soft

  return (
    <div
      className={cn(
        'group rounded-2xl border border-l-[3px] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)]',
        t.shell,
        t.accent
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-[13px] font-medium tracking-wide', t.label)}>{label}</p>
          <p
            className={cn(
              'mt-2 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums',
              t.value
            )}
          >
            {loading ? '—' : value}
          </p>
          <p className={cn('mt-2.5 text-xs font-medium', t.hint)}>{hint}</p>
        </div>
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105',
            t.iconWrap
          )}
        >
          <Icon className="size-[18px]" strokeWidth={2} />
        </div>
      </div>
    </div>
  )
}

function formatDelta(delta) {
  const n = Number(delta) || 0
  const sign = n > 0 ? '+' : ''
  return `${sign}${n} from last month`
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { data, isLoading } = useDashboardOverview()

  const summaryCards = [
    {
      label: 'Total Clients',
      value: data?.totalClients ?? 0,
      hint: formatDelta(data?.clientsDelta),
      icon: Users,
      tone: 'azure',
      intensity: 'strong',
    },
    {
      label: 'Total Tasks',
      value: data?.totalTasks ?? 0,
      hint: 'Across all clients',
      icon: BarChart3,
      tone: 'mint',
      intensity: 'strong',
    },
    {
      label: 'Completed Tasks',
      value: data?.completedTasks ?? 0,
      hint: `${data?.completionRate ?? 0}% completion rate`,
      icon: CheckCircle2,
      tone: 'sage',
      intensity: 'strong',
    },
    {
      label: 'Staff Members',
      value: data?.activeStaff ?? 0,
      hint: 'Active team members',
      icon: UserCog,
      tone: 'lilac',
      intensity: 'strong',
    },
  ]

  const statusCards = [
    {
      label: 'New Tasks',
      value: data?.newTasks ?? 0,
      hint: 'Awaiting assignment',
      icon: CircleDot,
      tone: 'sky',
      intensity: 'soft',
    },
    {
      label: 'Blocked Tasks',
      value: data?.blockedTasks ?? 0,
      hint: 'Requires attention',
      icon: AlertCircle,
      tone: 'blush',
      intensity: 'soft',
    },
    {
      label: 'In Review',
      value: data?.inReview ?? 0,
      hint: 'Pending approval',
      icon: Eye,
      tone: 'apricot',
      intensity: 'soft',
    },
    {
      label: 'In Progress',
      value: data?.inProgress ?? 0,
      hint: 'Currently working',
      icon: Clock,
      tone: 'iris',
      intensity: 'soft',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Dashboard Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back, {user?.name || 'there'}! Here&apos;s your task management overview.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <StatCard key={card.label} {...card} loading={isLoading} />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statusCards.map((card) => (
          <StatCard key={card.label} {...card} loading={isLoading} />
        ))}
      </div>
    </div>
  )
}
