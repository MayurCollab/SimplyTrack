import { useMemo, useState } from 'react'
import { Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { projectSchema } from '@/lib/schemas'
import { useAppForm } from '@/hooks/useAppForm'
import { usePermission } from '@/hooks/usePermissions'
import {
  useClients,
  useManagers,
  useUsers,
  useProjects,
  useProjectMutations,
} from '@/hooks/useMasters'
import { DataTable } from '@/components/data-table/DataTable'
import { FilterBar } from '@/components/data-table/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { FormField, FormRow, FormSwitchRow } from '@/components/ui/form-field'
import { Sheet } from '@/components/ui/sheet'

const FORM_ID = 'project-form'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export default function ProjectsPage() {
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const { allowed: canAdd } = usePermission('projects', 'add')
  const { allowed: canEdit } = usePermission('projects', 'edit')
  const { allowed: canDelete } = usePermission('projects', 'delete')

  const filters = useMemo(
    () => ({
      search: search || undefined,
      clientId: clientFilter || undefined,
      assigneeId: assigneeFilter || undefined,
    }),
    [search, clientFilter, assigneeFilter]
  )

  const { data = [], isLoading } = useProjects(filters)
  const { data: clients = [] } = useClients()
  const { data: managers = [] } = useManagers()
  const { data: users = [] } = useUsers()
  const { create, update, remove } = useProjectMutations()

  const staffOptions = useMemo(() => {
    const map = new Map()
    ;[...managers, ...users].forEach((u) => {
      if (u.isActive !== false) map.set(u._id, u)
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [managers, users])

  const activeClients = useMemo(
    () =>
      clients
        .filter((c) => c.isActive !== false)
        .sort((a, b) => a.organizationName.localeCompare(b.organizationName)),
    [clients]
  )

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.organizationName.localeCompare(b.organizationName)),
    [clients]
  )

  const form = useAppForm({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '',
      clientId: '',
      assignedTo: [],
      estimatedTime: 0,
      isActive: true,
    },
  })

  function openCreate() {
    setEditing(null)
    form.reset({
      name: '',
      clientId: '',
      assignedTo: [],
      estimatedTime: 0,
      isActive: true,
    })
    setSheetOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    form.reset({
      name: row.name,
      clientId: row.clientId?._id || row.clientId || '',
      assignedTo: (row.assignedTo || []).map((u) => u._id || u),
      estimatedTime: row.estimatedTime ?? 0,
      isActive: row.isActive ?? true,
    })
    setSheetOpen(true)
  }

  async function onSubmit(values) {
    if (editing) {
      await update.mutateAsync({ id: editing._id, ...values })
    } else {
      await create.mutateAsync(values)
    }
    setSheetOpen(false)
  }

  const columnDefs = useMemo(
    () => [
      { field: 'name', headerName: 'Project Name', flex: 2, cellClass: 'cell-emphasis' },
      {
        headerName: 'Client',
        flex: 1.5,
        valueGetter: (p) => p.data.clientId?.organizationName || '-',
      },
      {
        headerName: 'Assigned To',
        flex: 1.8,
        cellRenderer: (p) => {
          const people = p.data.assignedTo || []
          if (!people.length) return <span className="text-muted-foreground">-</span>
          return (
            <div className="flex h-full items-center gap-1">
              {people.slice(0, 4).map((u) => (
                <span
                  key={u._id}
                  title={u.name}
                  className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
                >
                  {initials(u.name)}
                </span>
              ))}
              {people.length > 4 && (
                <span className="text-xs text-muted-foreground">+{people.length - 4}</span>
              )}
            </div>
          )
        },
      },
      {
        field: 'estimatedTime',
        headerName: 'Estimated Time',
        width: 140,
        cellRenderer: (p) => (
          <span className="font-bold tabular-nums text-slate-800">{p.value ?? 0}h</span>
        ),
      },
      {
        field: 'isActive',
        headerName: 'Active',
        width: 90,
        valueFormatter: (p) => (p.value ? 'Yes' : 'No'),
      },
      {
        headerName: 'Actions',
        width: 110,
        sortable: false,
        cellRenderer: (p) => (
          <div className="flex h-full items-center gap-1">
            {canEdit && (
              <button type="button" onClick={() => openEdit(p.data)} className="rounded p-1 hover:bg-muted">
                <Pencil className="size-4 text-muted-foreground" />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => setDeleteId(p.data._id)}
                className="rounded p-1 hover:bg-muted"
              >
                <Trash2 className="size-4 text-destructive" />
              </button>
            )}
          </div>
        ),
      },
    ],
    [canEdit, canDelete]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Project Master</h1>
          <p className="text-sm text-muted-foreground">
            Link projects to clients and assign team members.
          </p>
        </div>
        {canAdd && (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add Project
          </Button>
        )}
      </div>

      <FilterBar search={search} onSearchChange={setSearch} placeholder="Search projects…">
        <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="w-48">
          <option value="">All clients</option>
          {sortedClients.map((c) => (
            <option key={c._id} value={c._id}>
              {c.organizationName}
            </option>
          ))}
        </Select>
        <Select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="w-44"
        >
          <option value="">All assignees</option>
          {staffOptions.map((u) => (
            <option key={u._id} value={u._id}>
              {u.name}
            </option>
          ))}
        </Select>
      </FilterBar>

      <DataTable columnDefs={columnDefs} rowData={data} loading={isLoading} />

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? 'Edit Project' : 'Add Project'}
        size="xl"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} disabled={create.isPending || update.isPending}>
              {editing ? 'Update Project' : 'Create Project'}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField label="Project Name" htmlFor="name" required error={form.formState.errors.name?.message}>
            <Input id="name" {...form.register('name')} />
          </FormField>

          <FormField label="Client" htmlFor="clientId" required error={form.formState.errors.clientId?.message}>
            <Select id="clientId" {...form.register('clientId')}>
              <option value="">Select client…</option>
              {activeClients.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.organizationName}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Assigned To">
            <Controller
              name="assignedTo"
              control={form.control}
              render={({ field }) => (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {staffOptions.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">No staff available yet.</p>
                  ) : (
                    staffOptions.map((u) => {
                      const checked = field.value?.includes(u._id)
                      return (
                        <label
                          key={u._id}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                            checked && 'bg-primary/5'
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-4 rounded border-border"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...(field.value || []), u._id]
                                : (field.value || []).filter((id) => id !== u._id)
                              field.onChange(next)
                            }}
                          />
                          <span>{u.name}</span>
                          <span className="text-xs capitalize text-muted-foreground">({u.role})</span>
                        </label>
                      )
                    })
                  )}
                </div>
              )}
            />
          </FormField>

          <FormSwitchRow label="Active">
            <Switch
              checked={form.watch('isActive')}
              onCheckedChange={(v) => form.setValue('isActive', v)}
            />
          </FormSwitchRow>

          <FormField
            label="Estimated Time (hours)"
            htmlFor="estimatedTime"
            error={form.formState.errors.estimatedTime?.message}
          >
            <Input
              id="estimatedTime"
              type="number"
              step="0.01"
              min="0"
              {...form.register('estimatedTime', { valueAsNumber: true })}
            />
          </FormField>
        </form>
      </Sheet>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete project?"
        message="This project will be permanently removed."
        loading={remove.isPending}
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => {
          await remove.mutateAsync(deleteId)
          setDeleteId(null)
        }}
      />
    </div>
  )
}
