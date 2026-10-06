import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller } from 'react-hook-form'
import { CheckCircle2, Ban, Pencil, Play, Plus, Square, Share2 } from 'lucide-react'
import { taskSchema } from '@/lib/schemas'
import { useAppForm } from '@/hooks/useAppForm'
import { usePermission } from '@/hooks/usePermissions'
import {
  useTasks,
  useTask,
  useTaskMutations,
  useTimerActions,
  useRecurringCheck,
} from '@/hooks/useTimer'
import { useClients, useServices, useStages, useUsers, useManagers } from '@/hooks/useMasters'
import { useTimerStore } from '@/store/timerStore'
import { DataTable } from '@/components/data-table/DataTable'
import { FilterBar } from '@/components/data-table/FilterBar'
import { PriorityBadge, StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormField, FormRow } from '@/components/ui/form-field'
import { MentionField } from '@/components/shared/MentionField'
import { Sheet } from '@/components/ui/sheet'
import { CompliancePeriodField } from '@/components/tasks/CompliancePeriodField'
import { ReviewPointsField } from '@/components/tasks/ReviewPointsField'
import { AlertField } from '@/components/tasks/AlertField'
import {
  CompleteTaskDialog,
  IgnoreTaskDialog,
  StatusDatePromptDialog,
} from '@/components/tasks/LifecycleDialogs'
import { SuggestedTasksBanner } from '@/components/tasks/SuggestedTasksBanner'
import {
  formatClockTime,
  formatElapsed,
  formatHoursLabel,
  formatHoursVsBudget,
  isOverBudget,
  liveLoggedMinutes,
} from '@/lib/time'
import { addBusinessDays } from '@/lib/businessDays'
import {
  buildTaskTitle,
  formatCompliancePeriodValue,
  inferCompliancePeriodInput,
  toDateInputValue,
} from '@/lib/compliancePeriod'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import {
  ShareHoursDialog,
  ReviewShareRequestDialog,
} from '@/components/tasks/ShareHoursDialog'
import { useShareRequests, useShareRequestMutations } from '@/hooks/useShareRequests'

const FORM_ID = 'task-form'

const EMPTY_FORM = {
  description: '',
  reviewPoints: [],
  clientId: '',
  serviceId: '',
  assigneeId: '',
  helpingMemberId: '',
  stageId: '',
  priority: 'medium',
  compliancePeriodInput: '',
  taskReceiveDate: new Date().toISOString().slice(0, 10),
  querySentDate: '',
  replyReceivedDate: '',
  targetDate: '',
  budgetHours: 1,
  isRecurring: false,
  recurrenceFrequency: '',
  recurrenceStartDate: '',
  recurrenceEndDate: '',
  alertId: '',
}

function emptyToNull(value) {
  return value && String(value).trim() ? value : null
}

function normalizeReviewPoints(points = []) {
  return points
    .filter((point) => String(point.description || '').trim())
    .map((point) => ({
      ...(point._id ? { _id: point._id } : {}),
      description: String(point.description).trim(),
    }))
}

function isClosedTask(task) {
  return Boolean(task?.completedAt || task?.ignoredAt)
}

function IconButton({ title, onClick, className, children, disabled }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(e)
      }}
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50',
        className
      )}
    >
      {children}
    </button>
  )
}

function startOfDayMs(value) {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function dueStatus(value) {
  if (!value) return 'none'
  const days = Math.round((startOfDayMs(value) - startOfDayMs(new Date())) / 86400000)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 2) return 'soon'
  return 'ok'
}

function DateCell({ value, tone = 'muted' }) {
  if (!value) return <span className="text-muted-foreground">-</span>
  const styles = {
    overdue: 'font-bold tabular-nums text-red-600',
    today: 'font-bold tabular-nums text-amber-600',
    soon: 'font-bold tabular-nums text-amber-600',
    ok: 'font-bold tabular-nums text-slate-800',
    muted: 'font-semibold tabular-nums text-slate-700',
  }
  return <span className={styles[tone] || styles.muted}>{format(new Date(value), 'dd/MM/yyyy')}</span>
}

function TaskIdCell({ value }) {
  if (!value) return <span className="text-muted-foreground">-</span>
  return (
    <span className="inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 font-mono text-xs font-bold tracking-tight text-indigo-700 ring-1 ring-indigo-100">
      {value}
    </span>
  )
}

function LiveTimer({ startedAt }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="text-[13px] font-bold leading-none tabular-nums text-emerald-700">
      {formatElapsed(startedAt, now)}
    </span>
  )
}

function TimerSessionMeta({ startedAt, stoppedAt, running }) {
  const started = formatClockTime(startedAt)
  const stopped = formatClockTime(stoppedAt)
  if (!started && !stopped) return null

  return (
    <span className="shrink-0 whitespace-nowrap text-[10px] font-medium leading-none text-slate-500">
      {running
        ? `Started ${started}`
        : stopped
          ? `${started} – ${stopped}`
          : `Started ${started}`}
    </span>
  )
}

function firstName(name) {
  if (!name) return '—'
  return String(name).trim().split(/\s+/)[0] || name
}

function LiveHours({ loggedMinutes, budgetHours, startedAt, task }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!startedAt) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  const total = liveLoggedMinutes(loggedMinutes, startedAt, now)
  const over = isOverBudget(total, budgetHours)
  const live = Boolean(startedAt)
  const budgetMins = (budgetHours || 0) * 60
  const warn = !over && budgetMins > 0 && total / budgetMins >= 0.8
  const shared = Boolean(task?.isShared && task?.helpingMemberId)
  const assigneeName = firstName(task?.assigneeId?.name)
  const helperName = firstName(task?.helpingMemberId?.name)

  return (
    <span className="inline-flex h-full flex-col justify-center gap-0.5 py-0.5">
      <span
        className={cn(
          'inline-flex h-5 max-w-full items-center gap-1 rounded px-1.5 text-xs font-bold leading-none tabular-nums',
          !live && !over && !warn && 'text-slate-800',
          warn && !live && 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
          live && !over && 'border border-emerald-200 bg-emerald-50 text-emerald-800',
          over && !live && 'bg-red-50 text-red-700 ring-1 ring-red-200',
          over && live && 'border border-red-200 bg-red-50 text-red-700'
        )}
        title={live ? 'Hours are updating with the running timer' : undefined}
      >
        {live && (
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative size-1.5 rounded-full bg-emerald-500" />
          </span>
        )}
        {formatHoursVsBudget(total, budgetHours)}
      </span>
      {shared && (
        <span
          className="max-w-[11rem] truncate px-0.5 text-[10px] font-medium leading-tight text-indigo-700"
          title={`${assigneeName}: ${formatHoursLabel(task.assigneeAllocatedHours)} | ${helperName}: ${formatHoursLabel(task.helperAllocatedHours)} (Shared)`}
        >
          {assigneeName}: {formatHoursLabel(task.assigneeAllocatedHours)}
          {' | '}
          {helperName}: {formatHoursLabel(task.helperAllocatedHours)}
          {' '}
          <span className="text-indigo-500">(Shared)</span>
        </span>
      )}
    </span>
  )
}

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const openTaskId = searchParams.get('open')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [staffId, setStaffId] = useState('')
  const [lifecycle, setLifecycle] = useState('open')
  const [targetFrom, setTargetFrom] = useState('')
  const [targetTo, setTargetTo] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [completeTask, setCompleteTask] = useState(null)
  const [ignoreTask, setIgnoreTask] = useState(null)
  const [statusDatePrompt, setStatusDatePrompt] = useState(null)
  const [shareTask, setShareTask] = useState(null)
  const [reviewShare, setReviewShare] = useState(null)
  const skipTargetAuto = useRef(false)
  const openedFromQuery = useRef(null)

  const user = useAuthStore((s) => s.user)

  const { allowed: canAdd } = usePermission('tasks', 'add')
  const { allowed: canEdit } = usePermission('tasks', 'edit')
  const { allowed: canEditBudget } = usePermission('tasks', 'editBudgetHours')
  const { allowed: canEditTarget } = usePermission('tasks', 'editTargetDate')
  const { allowed: canComplete } = usePermission('tasks', 'complete')
  const { allowed: canIgnore } = usePermission('tasks', 'ignore')

  const filters = useMemo(
    () => ({
      search: search || undefined,
      status: status || undefined,
      priority: priority || undefined,
      staffId: staffId || undefined,
      lifecycle: lifecycle || undefined,
      targetFrom: targetFrom || undefined,
      targetTo: targetTo || undefined,
    }),
    [search, status, priority, staffId, lifecycle, targetFrom, targetTo]
  )

  const { data = [], isLoading } = useTasks(filters)
  const { data: openTask } = useTask(openTaskId)
  // While a task sheet is open, poll so replies from another profile appear without reload
  const liveTaskId = sheetOpen && editing?._id ? editing._id : null
  const { data: liveTask } = useTask(liveTaskId, {
    refetchInterval: liveTaskId ? 5_000 : false,
    staleTime: 2_000,
  })
  const { create, update, complete, ignore } = useTaskMutations()
  const { data: stages = [] } = useStages()
  const { data: users = [] } = useUsers()
  const { data: clients = [] } = useClients()
  const { data: services = [] } = useServices()
  const { data: managers = [] } = useManagers()
  const { data: pendingShares = [] } = useShareRequests('pending', Boolean(user))
  const {
    create: createShare,
    approve: approveShare,
    reject: rejectShare,
  } = useShareRequestMutations()

  const reviewableShares = useMemo(() => {
    if (!user?._id) return []
    return (pendingShares || []).filter((r) => {
      if (r.status && r.status !== 'pending') return false
      const managerId = r.taskId?.managerId?._id || r.taskId?.managerId
      if (user.role === 'super_admin' || user.role === 'owner') return true
      return managerId && String(managerId) === String(user._id)
    })
  }, [pendingShares, user?._id, user?.role])

  const active = useTimerStore((s) => s.active)
  const { startTaskTimer, openNoteDialog } = useTimerActions()

  const assignees = useMemo(() => {
    const map = new Map()
    ;[...managers, ...users].forEach((u) => {
      if (u.isActive !== false) map.set(u._id, u)
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [managers, users])

  const form = useAppForm({
    resolver: zodResolver(taskSchema),
    defaultValues: EMPTY_FORM,
  })

  const clientId = form.watch('clientId')
  const serviceId = form.watch('serviceId')
  const compliancePeriodInput = form.watch('compliancePeriodInput')
  const taskReceiveDate = form.watch('taskReceiveDate')
  const assigneeId = form.watch('assigneeId')
  const isRecurring = form.watch('isRecurring')

  const { data: recurringCheck } = useRecurringCheck(
    sheetOpen && !editing ? clientId : null,
    sheetOpen && !editing ? serviceId : null
  )
  const showRecurringFields = Boolean(
    sheetOpen && !editing && clientId && serviceId && recurringCheck?.isFirstTime
  )

  useEffect(() => {
    if (editing || !serviceId || !sheetOpen) return
    const service = services.find((s) => s._id === serviceId)
    if (service) form.setValue('budgetHours', service.estimatedHours)
  }, [serviceId, services, editing, sheetOpen, form])

  const prevServiceId = useRef('')
  const prevClientId = useRef('')
  useEffect(() => {
    if (!sheetOpen || editing) return
    if (prevServiceId.current && prevServiceId.current !== serviceId) {
      form.setValue('compliancePeriodInput', '')
      form.setValue('isRecurring', false)
      form.setValue('recurrenceFrequency', '')
      form.setValue('alertId', '')
    }
    prevServiceId.current = serviceId
  }, [serviceId, sheetOpen, editing, form])

  useEffect(() => {
    if (!sheetOpen || editing) return
    if (prevClientId.current && prevClientId.current !== clientId) {
      form.setValue('isRecurring', false)
      form.setValue('recurrenceFrequency', '')
      form.setValue('alertId', '')
    }
    prevClientId.current = clientId
  }, [clientId, sheetOpen, editing, form])

  useEffect(() => {
    if (!sheetOpen || !taskReceiveDate || !serviceId) return
    if (skipTargetAuto.current) {
      skipTargetAuto.current = false
      return
    }
    const service = services.find((s) => s._id === serviceId)
    if (!service) return
    const computed = addBusinessDays(taskReceiveDate, service.turnaroundBusinessDays ?? 0)
    if (computed) form.setValue('targetDate', computed)
  }, [taskReceiveDate, serviceId, services, sheetOpen, form])

  const selectedClient = clients.find((c) => c._id === clientId)
  const selectedService = services.find((s) => s._id === serviceId)

  const titlePreview = useMemo(() => {
    const periodValue = formatCompliancePeriodValue(
      compliancePeriodInput,
      selectedService?.compliancePeriodType
    )
    return buildTaskTitle(
      selectedClient?.organizationName,
      selectedService?.name,
      periodValue
    )
  }, [selectedClient, selectedService, compliancePeriodInput])

  const selectedAssignee = assignees.find((u) => u._id === assigneeId)

  const managerDisplay = useMemo(() => {
    if (!selectedAssignee?.reportingManagerId) {
      return editing?.managerId?.name || '-'
    }
    const mid =
      selectedAssignee.reportingManagerId._id || selectedAssignee.reportingManagerId
    const m = managers.find((x) => x._id === mid)
    return m?.name || selectedAssignee.reportingManagerId?.name || '-'
  }, [selectedAssignee, managers, editing])

  function openCreate() {
    setEditing(null)
    form.reset({
      ...EMPTY_FORM,
      taskReceiveDate: new Date().toISOString().slice(0, 10),
      recurrenceStartDate: new Date().toISOString().slice(0, 10),
    })
    setSheetOpen(true)
  }

  function openEdit(row) {
    skipTargetAuto.current = true
    setEditing(row)
    const service = services.find(
      (s) => s._id === (row.serviceId?._id || row.serviceId)
    )
    form.reset({
      description: row.description || '',
      reviewPoints: (row.reviewPoints || []).map((point) => ({
        _id: point._id,
        description: point.description || '',
      })),
      clientId: row.clientId?._id || row.clientId || '',
      serviceId: row.serviceId?._id || row.serviceId || '',
      assigneeId: row.assigneeId?._id || row.assigneeId || '',
      helpingMemberId: row.helpingMemberId?._id || row.helpingMemberId || '',
      stageId: row.stageId?._id || row.stageId || '',
      priority: row.priority || 'medium',
      compliancePeriodInput: inferCompliancePeriodInput(row, service),
      taskReceiveDate: toDateInputValue(row.taskReceiveDate),
      querySentDate: toDateInputValue(row.querySentDate),
      replyReceivedDate: toDateInputValue(row.replyReceivedDate),
      targetDate: toDateInputValue(row.targetDate),
      budgetHours: row.budgetHours,
      isRecurring: false,
      recurrenceFrequency: '',
      recurrenceStartDate: '',
      recurrenceEndDate: '',
      alertId: '',
    })
    setSheetOpen(true)
  }

  useEffect(() => {
    if (!openTaskId || !openTask || !services.length) return
    // Allow reopening the same task from another notification click (open=id&t=…)
    const openToken = searchParams.get('t') || openTaskId
    if (openedFromQuery.current === openToken) return
    openedFromQuery.current = openToken
    openEdit(openTask)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('open')
        next.delete('t')
        return next
      },
      { replace: true }
    )
  }, [openTaskId, openTask, services.length, searchParams.get('t')])

  // Sync new replies into the open sheet without resetting the form / full page reload
  useEffect(() => {
    if (!liveTask || !editing?._id) return
    if (String(liveTask._id) !== String(editing._id)) return

    const replySig = (points = []) =>
      (points || [])
        .map((p) => {
          const replies = p.replies || []
          const last = replies[replies.length - 1]
          return `${p._id}:${replies.length}:${last?._id || last?.createdAt || ''}`
        })
        .join('|')

    setEditing((prev) => {
      if (!prev) return prev
      if (replySig(prev.reviewPoints) === replySig(liveTask.reviewPoints)) return prev
      return {
        ...prev,
        reviewPoints: liveTask.reviewPoints,
        reviewPointsHistory: liveTask.reviewPointsHistory,
      }
    })
  }, [liveTask])

  async function onSubmit(values) {
    const payload = {
      ...values,
      reviewPoints: normalizeReviewPoints(values.reviewPoints),
      helpingMemberId: values.helpingMemberId || null,
      querySentDate: emptyToNull(values.querySentDate),
      replyReceivedDate: emptyToNull(values.replyReceivedDate),
      targetDate: values.targetDate || null,
      dueDate: values.targetDate || values.taskReceiveDate || null,
      isRecurring: showRecurringFields ? Boolean(values.isRecurring) : false,
      recurrenceFrequency: values.isRecurring ? values.recurrenceFrequency || null : null,
      recurrenceStartDate: values.isRecurring
        ? emptyToNull(values.recurrenceStartDate)
        : null,
      recurrenceEndDate: values.isRecurring ? emptyToNull(values.recurrenceEndDate) : null,
      alertId: values.isRecurring ? emptyToNull(values.alertId) : null,
    }
    if (editing) {
      const {
        isRecurring: _r,
        recurrenceFrequency: _f,
        recurrenceStartDate: _s,
        recurrenceEndDate: _e,
        alertId: _a,
        ...updatePayload
      } = payload
      await update.mutateAsync({ id: editing._id, ...updatePayload })
    } else {
      await create.mutateAsync(payload)
    }
    setSheetOpen(false)
  }

  function handleStageChange(nextStageId) {
    const prevId = form.getValues('stageId')
    const next = stages.find((s) => s._id === nextStageId)
    const prev = stages.find((s) => s._id === prevId)

    if (next?.systemKey === 'query_sent' && !form.getValues('querySentDate')) {
      setStatusDatePrompt({ type: 'query_sent', nextStageId })
      return
    }

    if (
      prev?.systemKey === 'waiting_client' &&
      next?.systemKey !== 'waiting_client' &&
      !form.getValues('replyReceivedDate')
    ) {
      setStatusDatePrompt({ type: 'reply_received', nextStageId })
      return
    }

    form.setValue('stageId', nextStageId, { shouldValidate: true })
  }

  function applyStatusDatePrompt({ date }) {
    if (!statusDatePrompt) return
    if (statusDatePrompt.type === 'query_sent') {
      form.setValue('querySentDate', date, { shouldValidate: true })
    } else {
      form.setValue('replyReceivedDate', date, { shouldValidate: true })
    }
    form.setValue('stageId', statusDatePrompt.nextStageId, { shouldValidate: true })
    setStatusDatePrompt(null)
  }

  const columnDefs = useMemo(
    () => [
      {
        field: 'taskCode',
        headerName: 'Task ID',
        width: 118,
        maxWidth: 140,
        cellRenderer: (p) => <TaskIdCell value={p.value} />,
      },
      {
        headerName: 'Client',
        flex: 1.2,
        minWidth: 120,
        cellClass: 'cell-emphasis',
        valueGetter: (p) => p.data.clientId?.organizationName || '-',
      },
      {
        field: 'title',
        headerName: 'Task',
        flex: 1.6,
        minWidth: 140,
        cellClass: 'cell-emphasis',
      },
      {
        headerName: 'Staff',
        width: 120,
        maxWidth: 150,
        cellRenderer: (p) => {
          const name = p.data.assigneeId?.name || '-'
          if (!p.data.isShared || !p.data.helpingMemberId?.name) {
            return <span className="truncate">{name}</span>
          }
          return (
            <span className="flex flex-col leading-tight">
              <span className="truncate">{name}</span>
              <span className="truncate text-[10px] font-medium text-indigo-600">
                + {firstName(p.data.helpingMemberId.name)} (Shared)
              </span>
            </span>
          )
        },
      },
      {
        headerName: 'Status',
        width: 120,
        maxWidth: 150,
        cellRenderer: (p) => (
          <StatusBadge name={p.data.stageId?.name} color={p.data.stageId?.color} />
        ),
      },
      {
        field: 'priority',
        headerName: 'Priority',
        width: 96,
        maxWidth: 110,
        cellRenderer: (p) => <PriorityBadge priority={p.value} />,
      },
      {
        headerName: 'Hours',
        width: 168,
        maxWidth: 200,
        cellClass: 'tabular-nums',
        cellRenderer: (p) => {
          const runningHere =
            active?.type === 'task' &&
            String(active.taskId?._id || active.taskId) === String(p.data._id)
          return (
            <LiveHours
              loggedMinutes={p.data.totalLoggedMinutes}
              budgetHours={p.data.budgetHours}
              startedAt={runningHere ? active.startedAt : null}
              task={p.data}
            />
          )
        },
      },
      {
        field: 'taskReceiveDate',
        headerName: 'Received',
        width: 100,
        maxWidth: 110,
        cellRenderer: (p) => <DateCell value={p.value} />,
      },
      {
        field: 'targetDate',
        headerName: 'Target',
        width: 100,
        maxWidth: 110,
        cellRenderer: (p) => <DateCell value={p.value} tone="ok" />,
      },
      {
        field: 'dueDate',
        headerName: 'Due Date',
        width: 100,
        maxWidth: 110,
        cellRenderer: (p) => {
          const closed = isClosedTask(p.data)
          const tone = closed ? 'muted' : dueStatus(p.value)
          return <DateCell value={p.value} tone={tone === 'none' ? 'muted' : tone} />
        },
      },
      {
        field: 'createdAt',
        headerName: 'Created',
        width: 100,
        maxWidth: 110,
        cellRenderer: (p) => <DateCell value={p.value} />,
      },
      {
        headerName: 'Timer',
        width: 150,
        maxWidth: 170,
        minWidth: 130,
        sortable: false,
        cellRenderer: (p) => {
          const closed = isClosedTask(p.data)
          const taskId = p.data._id
          const runningHere =
            active?.type === 'task' &&
            String(active.taskId?._id || active.taskId) === String(taskId)
          const startedAt = runningHere ? active.startedAt : p.data.lastTimerStartedAt
          const stoppedAt = runningHere ? null : p.data.lastTimerStoppedAt

          if (closed) {
            return (
              <div className="flex h-full items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500">
                  {p.data.completedAt ? 'Completed' : 'Ignored'}
                </span>
                <TimerSessionMeta startedAt={startedAt} stoppedAt={stoppedAt} />
              </div>
            )
          }

          if (!canEdit) {
            return runningHere ? (
              <div className="flex h-full items-center gap-1.5">
                <LiveTimer startedAt={active.startedAt} />
                <TimerSessionMeta startedAt={startedAt} running />
              </div>
            ) : (
              <div className="flex h-full items-center">
                <TimerSessionMeta startedAt={startedAt} stoppedAt={stoppedAt} />
              </div>
            )
          }

          if (runningHere) {
            return (
              <div className="flex h-full items-center gap-1.5">
                <IconButton
                  title="Stop timer"
                  onClick={() => openNoteDialog({ timeLog: active, mode: 'stop' })}
                  className="bg-red-50 text-red-600 hover:bg-red-100"
                >
                  <Square className="size-3 fill-current" />
                </IconButton>
                <LiveTimer startedAt={active.startedAt} />
                <TimerSessionMeta startedAt={startedAt} running />
              </div>
            )
          }

          return (
            <div className="flex h-full items-center gap-1.5">
              <IconButton
                title="Start timer"
                onClick={() => startTaskTimer.mutate(taskId)}
                disabled={startTaskTimer.isPending}
                className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              >
                <Play className="size-3.5 fill-current" />
              </IconButton>
              <TimerSessionMeta startedAt={startedAt} stoppedAt={stoppedAt} />
            </div>
          )
        },
      },
      {
        headerName: 'Actions',
        width: 140,
        maxWidth: 152,
        minWidth: 120,
        sortable: false,
        pinned: 'right',
        cellRenderer: (p) => {
          const closed = isClosedTask(p.data)
          const assigneeId = String(p.data.assigneeId?._id || p.data.assigneeId || '')
          const isAssignee = user?._id && assigneeId === String(user._id)
          const canShare = canEdit && isAssignee && !closed && !p.data.isShared
          return (
            <div className="flex h-full items-center gap-1">
              {canShare && (
                <IconButton
                  title="Share remaining hours"
                  onClick={() => setShareTask(p.data)}
                  className="text-indigo-600 hover:bg-indigo-50"
                >
                  <Share2 className="size-3.5" />
                </IconButton>
              )}
              {canEdit && (
                <IconButton
                  title="Edit"
                  onClick={() => openEdit(p.data)}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </IconButton>
              )}
              {canComplete && !closed && (
                <IconButton
                  title="Mark Complete"
                  onClick={() => setCompleteTask(p.data)}
                  className="text-emerald-600 hover:bg-emerald-50"
                >
                  <CheckCircle2 className="size-3.5" />
                </IconButton>
              )}
              {canIgnore && !closed && (
                <IconButton
                  title="Ignore Task"
                  onClick={() => setIgnoreTask(p.data)}
                  className="text-muted-foreground hover:bg-red-50 hover:text-red-600"
                >
                  <Ban className="size-3.5" />
                </IconButton>
              )}
            </div>
          )
        },
      },
    ],
    [canEdit, canComplete, canIgnore, active, startTaskTimer, openNoteDialog, user?._id]
  )

  const emptyMasters = !clients.length || !stages.length
  const activeClients = clients
    .filter((c) => c.isActive !== false)
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName))
  const activeServices = services
    .filter((s) => s.isActive !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
  const editableStages = stages
    .filter(
      (s) =>
        s.isActive !== false &&
        s.systemKey !== 'completed' &&
        s.systemKey !== 'ignored'
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
  const isSaving = create.isPending || update.isPending
  const editingClosed = isClosedTask(editing)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Task Master</h1>
          <p className="text-sm text-muted-foreground">
            Track work with timers - start/stop logging time against tasks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canAdd && (
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              New Task
            </Button>
          )}
        </div>
      </div>

      {emptyMasters && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Add at least one{' '}
          <Link to="/clients" className="font-medium underline">
            client
          </Link>
          ,{' '}
          <Link to="/services" className="font-medium underline">
            service
          </Link>
          , and{' '}
          <Link to="/stages" className="font-medium underline">
            stage
          </Link>{' '}
          before creating tasks.
        </div>
      )}

      <SuggestedTasksBanner />

      {reviewableShares.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-indigo-900">
              Pending hour-share requests ({reviewableShares.length})
            </p>
          </div>
          <ul className="space-y-2">
            {reviewableShares.map((req) => (
              <li
                key={req._id}
                className="flex flex-col gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium text-slate-900">
                    {req.taskId?.taskCode ? `${req.taskId.taskCode} — ` : ''}
                    {req.taskId?.title || 'Task'}
                  </p>
                  <p className="text-xs text-slate-600">
                    {req.requestedById?.name || 'Someone'} → {req.toUserId?.name || 'Member'} ·{' '}
                    <span className="tabular-nums">
                      {Number(req.keepHours).toFixed(1)}h / {Number(req.transferHours).toFixed(1)}h
                    </span>
                  </p>
                  {req.requesterComment ? (
                    <p className="mt-0.5 text-xs text-slate-500">“{req.requesterComment}”</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => setReviewShare({ request: req, decision: 'reject' })}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setReviewShare({ request: req, decision: 'approve' })}
                  >
                    Approve
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FilterBar search={search} onSearchChange={setSearch} placeholder="Search task ID, title, or client…">
        <Select value={lifecycle} onChange={(e) => setLifecycle(e.target.value)} className="w-[8.5rem] shrink-0">
          <option value="open">Open</option>
          <option value="completed">Completed</option>
          <option value="ignored">Ignored</option>
          <option value="all">All</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-[9.5rem] shrink-0">
          <option value="">All statuses</option>
          {[...stages]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
            .map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-[8.5rem] shrink-0">
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>
        <Select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-[9.5rem] shrink-0">
          <option value="">All staff</option>
          {[...users]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((u) => (
              <option key={u._id} value={u._id}>
                {u.name}
              </option>
            ))}
        </Select>
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
            Target
          </span>
          <Input
            type="date"
            value={targetFrom}
            onChange={(e) => setTargetFrom(e.target.value)}
            className="w-[9.75rem]"
            title="Target date from"
            aria-label="Target date from"
            ukSpellcheck={false}
          />
          <span className="text-xs text-muted-foreground" aria-hidden>
            –
          </span>
          <Input
            type="date"
            value={targetTo}
            onChange={(e) => setTargetTo(e.target.value)}
            className="w-[9.75rem]"
            title="Target date to"
            aria-label="Target date to"
            ukSpellcheck={false}
          />
        </div>
      </FilterBar>

      <DataTable
        columnDefs={columnDefs}
        rowData={data}
        loading={isLoading}
        height={520}
        rowHeight={52}
        getRowClass={(params) => {
          if (!params.data || isClosedTask(params.data)) return undefined
          const tone = dueStatus(params.data.dueDate)
          if (tone === 'overdue') return 'ag-row-overdue'
          if (tone === 'today' || tone === 'soon') return 'ag-row-due-soon'
          return undefined
        }}
      />

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? 'Edit Task' : 'Add Task'}
        size="full"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            {!editingClosed && (
              <Button type="submit" form={FORM_ID} disabled={isSaving}>
                {editing ? 'Update Task' : 'Create Task'}
              </Button>
            )}
          </>
        }
      >
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          {editingClosed && (
            <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              This task is{' '}
              <span className="font-medium text-foreground">
                {editing.completedAt ? 'completed' : 'ignored'}
              </span>
              {editing.completedAt && (
                <> on {format(new Date(editing.completedAt), 'dd/MM/yyyy')}</>
              )}
              {editing.ignoredAt && (
                <>
                  {' '}
                  on {format(new Date(editing.ignoredAt), 'dd/MM/yyyy')}
                  {editing.ignoreRemarks ? ` - ${editing.ignoreRemarks}` : ''}
                </>
              )}
              . Status and timer are locked.
            </div>
          )}

          {editing?.taskCode && (
            <FormField label="Task ID" htmlFor="taskCodeDisplay">
              <Input
                id="taskCodeDisplay"
                value={editing.taskCode}
                readOnly
                className="bg-muted font-mono font-bold text-indigo-700"
              />
            </FormField>
          )}

          <FormRow>
            <FormField
              label="Client"
              htmlFor="clientId"
              error={form.formState.errors.clientId?.message}
            >
              <Select id="clientId" {...form.register('clientId')}>
                <option value="">Select client…</option>
                {activeClients.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.organizationName}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Service"
              htmlFor="serviceId"
              error={form.formState.errors.serviceId?.message}
            >
              <Select id="serviceId" {...form.register('serviceId')}>
                <option value="">Select service…</option>
                {activeServices.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.estimatedHours}h)
                  </option>
                ))}
              </Select>
            </FormField>
          </FormRow>

          {serviceId && (
            <CompliancePeriodField
              compliancePeriodType={selectedService?.compliancePeriodType}
              value={compliancePeriodInput}
              onChange={(v) =>
                form.setValue('compliancePeriodInput', v, { shouldValidate: true })
              }
              error={form.formState.errors.compliancePeriodInput?.message}
            />
          )}

          {showRecurringFields && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <FormField label="Is this a recurring task?" htmlFor="isRecurring">
                <Select
                  id="isRecurring"
                  value={isRecurring ? 'yes' : 'no'}
                  onChange={(e) => {
                    const yes = e.target.value === 'yes'
                    form.setValue('isRecurring', yes, { shouldValidate: true })
                    if (yes && !form.getValues('recurrenceStartDate')) {
                      form.setValue(
                        'recurrenceStartDate',
                        form.getValues('taskReceiveDate') ||
                          new Date().toISOString().slice(0, 10)
                      )
                    }
                    if (!yes) form.setValue('alertId', '')
                  }}
                >
                  <option value="no">No - one-time task</option>
                  <option value="yes">Yes - set up recurrence</option>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Asked only the first time this client + service combination is created.
                </p>
              </FormField>

              {isRecurring && (
                <>
                  <FormField
                    label="Frequency"
                    htmlFor="recurrenceFrequency"
                    error={form.formState.errors.recurrenceFrequency?.message}
                  >
                    <Select id="recurrenceFrequency" {...form.register('recurrenceFrequency')}>
                      <option value="">Select frequency…</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </Select>
                  </FormField>
                  <AlertField
                    value={form.watch('alertId')}
                    onChange={(id) => form.setValue('alertId', id)}
                  />
                  <FormRow>
                    <FormField
                      label="Start Date"
                      htmlFor="recurrenceStartDate"
                      error={form.formState.errors.recurrenceStartDate?.message}
                    >
                      <Input
                        id="recurrenceStartDate"
                        type="date"
                        {...form.register('recurrenceStartDate')}
                      />
                    </FormField>
                    <FormField label="End Date" htmlFor="recurrenceEndDate">
                      <Input
                        id="recurrenceEndDate"
                        type="date"
                        {...form.register('recurrenceEndDate')}
                      />
                      <p className="text-xs text-muted-foreground">Optional</p>
                    </FormField>
                  </FormRow>
                </>
              )}
            </div>
          )}

          <FormRow className="sm:grid-cols-3">
            <FormField
              label="Assignee"
              htmlFor="assigneeId"
              error={form.formState.errors.assigneeId?.message}
            >
              <Select id="assigneeId" {...form.register('assigneeId')}>
                <option value="">Select assignee…</option>
                {assignees.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Helping Member" htmlFor="helpingMemberId">
              <Select id="helpingMemberId" {...form.register('helpingMemberId')}>
                <option value="">None</option>
                {assignees.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Manager" htmlFor="managerDisplay">
              <Input id="managerDisplay" value={managerDisplay} readOnly className="bg-muted" />
              <p className="text-xs text-muted-foreground">
                Auto-filled from assignee&apos;s reporting manager
              </p>
            </FormField>
          </FormRow>

          <FormRow className="sm:grid-cols-3">
            <FormField
              label="Status"
              htmlFor="stageId"
              error={form.formState.errors.stageId?.message}
            >
              <Select
                id="stageId"
                value={form.watch('stageId')}
                onChange={(e) => handleStageChange(e.target.value)}
                disabled={editingClosed}
              >
                <option value="">Select status…</option>
                {editableStages.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
                {editingClosed && editing?.stageId && (
                  <option value={editing.stageId._id || editing.stageId}>
                    {editing.stageId?.name || 'Closed'}
                  </option>
                )}
              </Select>
            </FormField>
            <FormField label="Priority" htmlFor="priority">
              <Select id="priority" {...form.register('priority')}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </FormField>
            {editing?.createdAt ? (
              <FormField label="Task Create Date" htmlFor="taskCreateDate">
                <Input
                  id="taskCreateDate"
                  value={format(new Date(editing.createdAt), 'dd/MM/yyyy')}
                  readOnly
                  className="bg-muted"
                />
              </FormField>
            ) : (
              <div />
            )}
          </FormRow>

          <FormRow className="sm:grid-cols-4">
            <FormField
              label="Task Receive Date"
              htmlFor="taskReceiveDate"
              error={form.formState.errors.taskReceiveDate?.message}
            >
              <Input id="taskReceiveDate" type="date" {...form.register('taskReceiveDate')} />
            </FormField>
            <FormField label="Query Sent Date" htmlFor="querySentDate">
              <Input id="querySentDate" type="date" {...form.register('querySentDate')} />
            </FormField>
            <FormField label="Reply Received Date" htmlFor="replyReceivedDate">
              <Input id="replyReceivedDate" type="date" {...form.register('replyReceivedDate')} />
            </FormField>
            <FormField
              label="Target Date"
              htmlFor="targetDate"
              error={form.formState.errors.targetDate?.message}
            >
              <Input
                id="targetDate"
                type="date"
                readOnly={!canEditTarget}
                className={!canEditTarget ? 'bg-muted' : ''}
                {...form.register('targetDate')}
              />
              {!canEditTarget && (
                <p className="text-xs text-muted-foreground">
                  Auto-calculated from receive date + service turnaround.
                </p>
              )}
            </FormField>
          </FormRow>

          <FormRow>
            <FormField label="Title" htmlFor="titlePreview">
              <Input id="titlePreview" value={titlePreview} readOnly className="bg-muted" />
              <p className="text-xs text-muted-foreground">
                Auto-generated as Client - Service - compliance period
              </p>
            </FormField>
            <FormField
              label="Budget Hours"
              htmlFor="budgetHours"
              error={form.formState.errors.budgetHours?.message}
            >
              <Input
                id="budgetHours"
                type="number"
                step="0.01"
                min="0.01"
                readOnly={!canEditBudget}
                className={!canEditBudget ? 'bg-muted' : ''}
                {...form.register('budgetHours', { valueAsNumber: true })}
              />
              {!canEditBudget && (
                <p className="text-xs text-muted-foreground">
                  Auto-filled from service. You don&apos;t have permission to edit budget hours.
                </p>
              )}
            </FormField>
          </FormRow>

          <FormField label="Remarks" htmlFor="description">
            <Controller
              control={form.control}
              name="description"
              render={({ field }) => (
                <MentionField
                  id="description"
                  multiline
                  rows={3}
                  value={field.value || ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  users={assignees}
                  placeholder="Type @ to tag a teammate"
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              Type @ to tag someone by name or email. Tagged people can be emailed later.
            </p>
          </FormField>

          <ReviewPointsField
            control={form.control}
            register={form.register}
            errors={form.formState.errors}
            disabled={editing ? !canEdit : !canAdd}
            history={editing?.reviewPointsHistory || []}
            users={assignees}
            taskId={editing?._id}
            savedPoints={editing?.reviewPoints || []}
            onTaskUpdated={(task) => {
              if (task) setEditing(task)
            }}
          />
        </form>
      </Sheet>

      <CompleteTaskDialog
        open={!!completeTask}
        task={completeTask}
        loading={complete.isPending}
        onCancel={() => setCompleteTask(null)}
        onConfirm={async ({ completionDate }) => {
          await complete.mutateAsync({ id: completeTask._id, completionDate })
          setCompleteTask(null)
        }}
      />

      <IgnoreTaskDialog
        open={!!ignoreTask}
        task={ignoreTask}
        loading={ignore.isPending}
        onCancel={() => setIgnoreTask(null)}
        onConfirm={async ({ ignoreDate, remarks }) => {
          await ignore.mutateAsync({ id: ignoreTask._id, ignoreDate, remarks })
          setIgnoreTask(null)
        }}
      />

      <ShareHoursDialog
        open={!!shareTask}
        task={shareTask}
        users={assignees}
        loading={createShare.isPending}
        onCancel={() => setShareTask(null)}
        onConfirm={async (payload) => {
          await createShare.mutateAsync({ taskId: shareTask._id, ...payload })
          setShareTask(null)
        }}
      />

      <ReviewShareRequestDialog
        open={!!reviewShare}
        request={reviewShare?.request}
        decision={reviewShare?.decision}
        loading={approveShare.isPending || rejectShare.isPending}
        onCancel={() => setReviewShare(null)}
        onConfirm={async ({ managerComment }) => {
          const requestId = reviewShare.request._id
          if (reviewShare.decision === 'approve') {
            await approveShare.mutateAsync({ requestId, managerComment })
          } else {
            await rejectShare.mutateAsync({ requestId, managerComment })
          }
          setReviewShare(null)
        }}
      />

      <StatusDatePromptDialog
        open={!!statusDatePrompt}
        type={statusDatePrompt?.type}
        onCancel={() => setStatusDatePrompt(null)}
        onConfirm={applyStatusDatePrompt}
      />
    </div>
  )
}
