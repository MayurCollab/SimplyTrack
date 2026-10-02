import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { clientSchema } from '@/lib/schemas'
import { useAppForm } from '@/hooks/useAppForm'
import { getSystemTimezone, getTimezoneOptions, normalizeTimezone } from '@/lib/timezones'
import { usePermission } from '@/hooks/usePermissions'
import { useClients, useClientMutations } from '@/hooks/useMasters'
import { DataTable } from '@/components/data-table/DataTable'
import { FilterBar } from '@/components/data-table/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { FormField, FormSwitchRow } from '@/components/ui/form-field'
import { Sheet } from '@/components/ui/sheet'

const FORM_ID = 'client-form'
const SYSTEM_TIMEZONE = getSystemTimezone()
const TIMEZONES = getTimezoneOptions()

export default function ClientsPage() {
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const { allowed: canAdd } = usePermission('clients', 'add')
  const { allowed: canEdit } = usePermission('clients', 'edit')

  const { data = [], isLoading } = useClients(search)
  const { create, update, updateStatus } = useClientMutations()

  const form = useAppForm({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      organizationName: '',
      email: '',
      websiteUrl: '',
      timezone: SYSTEM_TIMEZONE,
      description: '',
      isActive: true,
    },
  })

  function openCreate() {
    setEditing(null)
    form.reset({
      organizationName: '',
      email: '',
      websiteUrl: '',
      timezone: SYSTEM_TIMEZONE,
      description: '',
      isActive: true,
    })
    setSheetOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    form.reset({
      organizationName: row.organizationName,
      email: row.email || '',
      websiteUrl: row.websiteUrl || '',
      timezone: normalizeTimezone(row.timezone || SYSTEM_TIMEZONE),
      description: row.description || '',
      isActive: row.isActive ?? true,
    })
    setSheetOpen(true)
  }

  async function onSubmit(values) {
    const payload = { ...values, timezone: normalizeTimezone(values.timezone) }
    if (editing) {
      await update.mutateAsync({ id: editing._id, ...payload })
    } else {
      await create.mutateAsync(payload)
    }
    setSheetOpen(false)
  }

  const columnDefs = useMemo(
    () => [
      { field: 'organizationName', headerName: 'Organization', flex: 2, cellClass: 'cell-emphasis' },
      { field: 'email', headerName: 'Email', flex: 1.5 },
      {
        field: 'timezone',
        headerName: 'Timezone',
        flex: 1.5,
        valueFormatter: (p) => normalizeTimezone(p.value),
      },
      {
        field: 'isActive',
        headerName: 'Active',
        width: 100,
        cellRenderer: (p) =>
          canEdit ? (
            <div className="flex h-full items-center">
              <Switch
                checked={p.value}
                onCheckedChange={(v) => updateStatus.mutate({ id: p.data._id, isActive: v })}
              />
            </div>
          ) : (
            (p.value ? 'Yes' : 'No')
          ),
      },
      {
        headerName: 'Actions',
        width: 80,
        sortable: false,
        cellRenderer: (p) =>
          canEdit ? (
            <button type="button" onClick={() => openEdit(p.data)} className="rounded p-1 hover:bg-muted">
              <Pencil className="size-4 text-muted-foreground" />
            </button>
          ) : null,
      },
    ],
    [canEdit, updateStatus]
  )

  const isSaving = create.isPending || update.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Client Master</h1>
          <p className="text-sm text-muted-foreground">Manage client organizations you work with.</p>
        </div>
        {canAdd && (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add Client
          </Button>
        )}
      </div>

      <FilterBar search={search} onSearchChange={setSearch} placeholder="Search clients…" />

      <DataTable columnDefs={columnDefs} rowData={data} loading={isLoading} />

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? 'Edit Client' : 'Add Client'}
        size="xl"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} disabled={isSaving}>
              {editing ? 'Update Client' : 'Create Client'}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            label="Organization Name"
            htmlFor="organizationName"
            required
            error={form.formState.errors.organizationName?.message}
          >
            <Input id="organizationName" {...form.register('organizationName')} />
          </FormField>

          <FormField label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          </FormField>

          <FormField label="Website URL" htmlFor="websiteUrl">
            <Input id="websiteUrl" placeholder="https://" {...form.register('websiteUrl')} />
          </FormField>

          <FormField label="Timezone" htmlFor="timezone">
            <Select id="timezone" {...form.register('timezone')}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Description" htmlFor="description">
            <Textarea id="description" rows={3} {...form.register('description')} />
          </FormField>

          <FormSwitchRow label="Active">
            <Switch
              checked={form.watch('isActive')}
              onCheckedChange={(v) => form.setValue('isActive', v)}
            />
          </FormSwitchRow>
        </form>
      </Sheet>
    </div>
  )
}
