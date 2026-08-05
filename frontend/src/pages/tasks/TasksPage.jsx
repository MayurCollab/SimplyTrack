import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Play, Plus, Square } from 'lucide-react'
import { taskSchema } from '@/lib/schemas'
import { useAppForm } from '@/hooks/useAppForm'
import { usePermission } from '@/hooks/usePermissions'
import { useTasks, useTaskMutations, useTimerActions } from '@/hooks/useTimer'
import { useClients, useServices, useStages, useUsers, useManagers } from '@/hooks/useMasters'
import { useTimerStore } from '@/store/timerStore'
import { DataTable } from '@/components/data-table/DataTable'
import { FilterBar } from '@/components/data-table/FilterBar'
import { PriorityBadge, StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField, FormRow } from '@/components/ui/form-field'
import { Sheet } from '@/components/ui/sheet'
import { formatElapsed, formatHoursVsBudget, isOverBudget } from '@/lib/time'
import { cn } from '@/lib/utils'

const FORM_ID = 'task-form'

const EMPTY_FORM = {
  title: '',
  description: '',
  clientId: '',
  serviceId: '',
  assigneeId: '',
  helpingMemberId: '',
  stageId: '',
  priority: 'medium',
  dueDate: '',
  budgetHours: 1,
}

function LiveTimer({ startedAt }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="tabular-nums text-xs font-semibold text-green-700">
      {formatElapsed(startedAt, now)}
    </span>
  )
}

export default function TasksPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [staffId, setStaffId] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const { allowed: canAdd } = usePermission('tasks', 'add')
  const { allowed: canEdit } = usePermission('tasks', 'edit')
  const { allowed: canEditBudget } = usePermission('tasks', 'editBudgetHours')

  const filters = useMemo(
    () => ({
      search: search || undefined,
      status: status || undefined,
      priority: priority || undefined,
      staffId: staffId || undefined,
    }),
    [search, status, priority, staffId]
  )

  const { data = [], isLoading } = useTasks(filters)
  const { create, update } = useTaskMutations()
  const { data: stages = [] } = useStages()
  const { data: users = [] } = useUsers()
  const { data: clients = [] } = useClients()
  const { data: services = [] } = useServices()
  const { data: managers = [] } = useManagers()

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

  const serviceId = form.watch('serviceId')
  const assigneeId = form.watch('assigneeId')

  useEffect(() => {
    if (editing || !serviceId || !sheetOpen) return
    const service = services.find((s) => s._id === serviceId)
    if (service) form.setValue('budgetHours', service.estimatedHours)
  }, [serviceId, services, editing, sheetOpen, form])

  const selectedAssignee = assignees.find((u) => u._id === assigneeId)

  const managerDisplay = useMemo(() => {
    if (!selectedAssignee?.reportingManagerId) {
      return editing?.managerId?.name || '—'
    }
    const mid =
      selectedAssignee.reportingManagerId._id || selectedAssignee.reportingManagerId
    const m = managers.find((x) => x._id === mid)
    return m?.name || selectedAssignee.reportingManagerId?.name || '—'
  }, [selectedAssignee, managers, editing])

  function openCreate() {
    setEditing(null)
    form.reset(EMPTY_FORM)
    setSheetOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    form.reset({
      title: row.title,
      description: row.description || '',
      clientId: row.clientId?._id || row.clientId || '',
      serviceId: row.serviceId?._id || row.serviceId || '',
      assigneeId: row.assigneeId?._id || row.assigneeId || '',
      helpingMemberId: row.helpingMemberId?._id || row.helpingMemberId || '',
      stageId: row.stageId?._id || row.stageId || '',
      priority: row.priority || 'medium',
      dueDate: row.dueDate ? new Date(row.dueDate).toISOString().slice(0, 10) : '',
      budgetHours: row.budgetHours,
    })
    setSheetOpen(true)
  }

  async function onSubmit(values) {
    const payload = {
      ...values,
      helpingMemberId: values.helpingMemberId || null,
    }
    if (editing) {
      await update.mutateAsync({ id: editing._id, ...payload })
    } else {
      await create.mutateAsync(payload)
    }
    setSheetOpen(false)
  }

  const columnDefs = useMemo(
    () => [
      {
        headerName: 'Client',
        flex: 1.4,
        valueGetter: (p) => p.data.clientId?.organizationName || '—',
      },
      {
        field: 'title',
        headerName: 'Task',
        flex: 2,
      },
      {
        headerName: 'Staff',
        flex: 1.2,
        valueGetter: (p) => p.data.assigneeId?.name || '—',
      },
      {
        headerName: 'Status',
        width: 130,
        cellRenderer: (p) => (
          <StatusBadge name={p.data.stageId?.name} color={p.data.stageId?.color} />
        ),
      },
      {
        field: 'priority',
        headerName: 'Priority',
        width: 110,
        cellRenderer: (p) => <PriorityBadge priority={p.value} />,
      },
      {
        headerName: 'Hours',
        width: 140,
        cellClass: 'tabular-nums',
        cellRenderer: (p) => {
          const over = isOverBudget(p.data.totalLoggedMinutes, p.data.budgetHours)
          return (
            <span className={cn(over && 'font-medium text-red-600')}>
              {formatHoursVsBudget(p.data.totalLoggedMinutes, p.data.budgetHours)}
            </span>
          )
        },
      },
      {
        field: 'dueDate',
        headerName: 'Due Date',
        width: 120,
        valueFormatter: (p) => (p.value ? format(new Date(p.value), 'dd/MM/yyyy') : '—'),
        cellClass: (p) => {
          if (!p.value) return ''
          const overdue =
            new Date(p.value) < new Date() &&
            new Date(p.value).setHours(0, 0, 0, 0) < Date.now()
          return overdue ? 'text-red-600' : ''
        },
      },
      {
        field: 'createdAt',
        headerName: 'Created',
        width: 120,
        valueFormatter: (p) => (p.value ? format(new Date(p.value), 'dd/MM/yyyy') : '—'),
      },
      {
        headerName: 'Timer',
        width: 120,
        sortable: false,
        cellRenderer: (p) => {
          if (!canEdit) return null
          const taskId = p.data._id
          const runningHere =
            active?.type === 'task' &&
            String(active.taskId?._id || active.taskId) === String(taskId)

          if (runningHere) {
            return (
              <div className="flex h-full items-center gap-1.5">
                <LiveTimer startedAt={active.startedAt} />
                <button
                  type="button"
                  className="rounded p-1 hover:bg-muted"
                  onClick={() => openNoteDialog({ timeLog: active, mode: 'stop' })}
                  title="Stop"
                >
                  <Square className="size-3.5 fill-current text-foreground" />
                </button>
              </div>
            )
          }

          return (
            <button
              type="button"
              className="rounded p-1 hover:bg-muted"
              onClick={() => startTaskTimer.mutate(taskId)}
              title="Start timer"
              disabled={startTaskTimer.isPending}
            >
              <Play className="size-4 text-primary" />
            </button>
          )
        },
      },
      {
        headerName: '',
        width: 70,
        sortable: false,
        cellRenderer: (p) =>
          canEdit ? (
            <button
              type="button"
              className="rounded p-1 hover:bg-muted"
              onClick={() => openEdit(p.data)}
            >
              <Pencil className="size-4 text-muted-foreground" />
            </button>
          ) : null,
      },
    ],
    [canEdit, active, startTaskTimer, openNoteDialog]
  )

  const emptyMasters = !clients.length || !stages.length
  const activeClients = clients
    .filter((c) => c.isActive !== false)
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName))
  const activeServices = services
    .filter((s) => s.isActive !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
  const activeStages = stages
    .filter((s) => s.isActive !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
  const isSaving = create.isPending || update.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Task Master</h1>
          <p className="text-sm text-muted-foreground">
            Track work with timers — start/stop logging time against tasks.
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

      <FilterBar search={search} onSearchChange={setSearch} placeholder="Search title or client…">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="">All statuses</option>
          {[...stages]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-36">
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>
        <Select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-40">
          <option value="">All staff</option>
          {[...users]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((u) => (
              <option key={u._id} value={u._id}>
                {u.name}
              </option>
            ))}
        </Select>
      </FilterBar>

      <DataTable columnDefs={columnDefs} rowData={data} loading={isLoading} height={520} />

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? 'Edit Task' : 'Add Task'}
        className="max-w-2xl"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} disabled={isSaving}>
              {editing ? 'Update Task' : 'Create Task'}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField label="Title" htmlFor="title" error={form.formState.errors.title?.message}>
            <Input id="title" {...form.register('title')} />
          </FormField>

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

          <FormRow>
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
          </FormRow>

          <FormField label="Manager" htmlFor="managerDisplay">
            <Input id="managerDisplay" value={managerDisplay} readOnly className="bg-muted" />
            <p className="text-xs text-muted-foreground">
              Auto-filled from assignee&apos;s reporting manager
            </p>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              label="Status"
              htmlFor="stageId"
              error={form.formState.errors.stageId?.message}
            >
              <Select id="stageId" {...form.register('stageId')}>
                <option value="">Select status…</option>
                {activeStages.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Priority" htmlFor="priority">
              <Select id="priority" {...form.register('priority')}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </FormField>
            <FormField
              label="Due Date"
              htmlFor="dueDate"
              error={form.formState.errors.dueDate?.message}
            >
              <Input id="dueDate" type="date" {...form.register('dueDate')} />
            </FormField>
          </div>

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

          <FormField label="Remarks" htmlFor="description">
            <Textarea id="description" rows={3} {...form.register('description')} />
          </FormField>
        </form>
      </Sheet>
    </div>
  )
}
