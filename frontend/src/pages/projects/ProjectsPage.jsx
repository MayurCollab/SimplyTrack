import { useMemo, useState } from 'react'
import { Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { projectSchema } from '@/lib/schemas'
import { useAppForm } from '@/hooks/useAppForm'
import { usePermission } from '@/hooks/usePermissions'
import {
  useClients,
  useServices,
  useProjects,
  useProjectMutations,
} from '@/hooks/useMasters'
import { DataTable } from '@/components/data-table/DataTable'
import { FilterBar } from '@/components/data-table/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { FormField, FormSwitchRow } from '@/components/ui/form-field'
import { Sheet } from '@/components/ui/sheet'

const FORM_ID = 'project-form'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

const EMPTY_FORM = {
  name: '',
  clientId: '',
  serviceIds: [],
  isActive: true,
}

export default function ProjectsPage() {
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
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
      serviceId: serviceFilter || undefined,
    }),
    [search, clientFilter, serviceFilter]
  )

  const { data = [], isLoading } = useProjects(filters)
  const { data: clients = [] } = useClients()
  const { data: services = [] } = useServices()
  const { create, update, remove } = useProjectMutations()

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

  const activeServices = useMemo(
    () =>
      services
        .filter((s) => s.isActive !== false)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [services]
  )

  const sortedServices = useMemo(
    () => [...services].sort((a, b) => a.name.localeCompare(b.name)),
    [services]
  )

  const form = useAppForm({
    resolver: zodResolver(projectSchema),
    defaultValues: EMPTY_FORM,
  })

  function openCreate() {
    setEditing(null)
    form.reset({ ...EMPTY_FORM })
    setSheetOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    form.reset({
      name: row.name,
      clientId: row.clientId?._id || row.clientId || '',
      serviceIds: (row.serviceIds || []).map((s) => s._id || s),
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
        headerName: 'Services',
        flex: 2.5,
        cellRenderer: (p) => {
          const list = p.data.serviceIds || []
          if (!list.length) return <span className="text-muted-foreground">-</span>
          return (
            <span className="text-sm text-slate-700">
              {list.map((s) => s.name || s).join(', ')}
            </span>
          )
        },
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
            Link projects to clients and select the services for each project.
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
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="w-48"
        >
          <option value="">All services</option>
          {sortedServices.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </Select>
      </FilterBar>

      <DataTable columnDefs={columnDefs} rowData={data} loading={isLoading} />

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? 'Edit Project' : 'Add Project'}
        size="md"
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
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
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

          <FormField
            label="Services"
            required
            error={form.formState.errors.serviceIds?.message}
          >
            <Controller
              name="serviceIds"
              control={form.control}
              render={({ field }) => (
                <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5">
                  {activeServices.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">
                      No active services available yet.
                    </p>
                  ) : (
                    activeServices.map((s) => {
                      const checked = field.value?.includes(s._id)
                      return (
                        <label
                          key={s._id}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted',
                            checked && 'bg-primary/5'
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-3.5 rounded border-border"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...(field.value || []), s._id]
                                : (field.value || []).filter((id) => id !== s._id)
                              field.onChange(next)
                            }}
                          />
                          <span className="truncate">{s.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            ({s.estimatedHours}h)
                          </span>
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
