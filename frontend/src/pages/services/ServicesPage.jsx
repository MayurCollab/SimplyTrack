import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { serviceSchema } from '@/lib/schemas'
import { useAppForm } from '@/hooks/useAppForm'
import { usePermission } from '@/hooks/usePermissions'
import { useServices, useServiceMutations } from '@/hooks/useMasters'
import { DataTable } from '@/components/data-table/DataTable'
import { FilterBar } from '@/components/data-table/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { FormField, FormSwitchRow } from '@/components/ui/form-field'
import { Sheet } from '@/components/ui/sheet'

const FORM_ID = 'service-form'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export default function ServicesPage() {
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const { allowed: canAdd } = usePermission('services', 'add')
  const { allowed: canEdit } = usePermission('services', 'edit')
  const { allowed: canDelete } = usePermission('services', 'delete')

  const { data = [], isLoading } = useServices(search)
  const { create, update, remove } = useServiceMutations()

  const form = useAppForm({
    resolver: zodResolver(serviceSchema),
    defaultValues: { name: '', estimatedHours: 1, isActive: true },
  })

  function openCreate() {
    setEditing(null)
    form.reset({ name: '', estimatedHours: 1, isActive: true })
    setSheetOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    form.reset({
      name: row.name,
      estimatedHours: row.estimatedHours,
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
      { field: 'name', headerName: 'Name', flex: 2 },
      {
        field: 'estimatedHours',
        headerName: 'Estimated Hours',
        width: 140,
        cellClass: 'tabular-nums',
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
                onCheckedChange={(v) => update.mutate({ id: p.data._id, isActive: v })}
              />
            </div>
          ) : (
            (p.value ? 'Yes' : 'No')
          ),
      },
      {
        headerName: 'Actions',
        width: 120,
        sortable: false,
        cellRenderer: (p) => (
          <div className="flex h-full items-center gap-1">
            {canEdit && (
              <button type="button" onClick={() => openEdit(p.data)} className="rounded p-1 hover:bg-muted">
                <Pencil className="size-4 text-muted-foreground" />
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={() => setDeleteId(p.data._id)} className="rounded p-1 hover:bg-muted">
                <Trash2 className="size-4 text-destructive" />
              </button>
            )}
          </div>
        ),
      },
    ],
    [canEdit, canDelete, update]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Service Master</h1>
          <p className="text-sm text-muted-foreground">Define services and default estimated hours.</p>
        </div>
        {canAdd && (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add Service
          </Button>
        )}
      </div>

      <FilterBar search={search} onSearchChange={setSearch} placeholder="Search services…" />

      <DataTable columnDefs={columnDefs} rowData={data} loading={isLoading} />

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? 'Edit Service' : 'Add Service'}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} disabled={create.isPending || update.isPending}>
              {editing ? 'Update Service' : 'Create Service'}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField label="Name" htmlFor="name" required error={form.formState.errors.name?.message}>
            <Input id="name" {...form.register('name')} />
          </FormField>
          <FormField
            label="Estimated Hours"
            htmlFor="estimatedHours"
            required
            error={form.formState.errors.estimatedHours?.message}
          >
            <Input
              id="estimatedHours"
              type="number"
              step="0.01"
              min="0.01"
              {...form.register('estimatedHours', { valueAsNumber: true })}
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
        title="Delete service?"
        message="This service will be permanently removed."
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
