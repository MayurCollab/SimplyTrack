import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { stageSchema } from '@/lib/schemas'
import { useAppForm } from '@/hooks/useAppForm'
import { usePermission } from '@/hooks/usePermissions'
import { useStages, useStageMutations } from '@/hooks/useMasters'
import { DataTable } from '@/components/data-table/DataTable'
import { FilterBar } from '@/components/data-table/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { FormField, FormRow, FormSwitchRow } from '@/components/ui/form-field'
import { Sheet } from '@/components/ui/sheet'

const FORM_ID = 'stage-form'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export default function StagesPage() {
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const { allowed: canAdd } = usePermission('stages', 'add')
  const { allowed: canEdit } = usePermission('stages', 'edit')
  const { allowed: canDelete } = usePermission('stages', 'delete')

  const { data = [], isLoading } = useStages(search)
  const { create, update, remove } = useStageMutations()

  const form = useAppForm({
    resolver: zodResolver(stageSchema),
    defaultValues: { name: '', color: '#6B7280', order: 0, isActive: true },
  })

  function openCreate() {
    setEditing(null)
    form.reset({ name: '', color: '#6B7280', order: 0, isActive: true })
    setSheetOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    form.reset({
      name: row.name,
      color: row.color || '#6B7280',
      order: row.order ?? 0,
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
        field: 'color',
        headerName: 'Color',
        width: 100,
        cellRenderer: (p) => (
          <span className="flex items-center gap-2">
            <span className="size-4 rounded-full border border-border" style={{ background: p.value }} />
            {p.value}
          </span>
        ),
      },
      { field: 'order', headerName: 'Order', width: 90 },
      {
        field: 'isActive',
        headerName: 'Active',
        width: 90,
        valueFormatter: (p) => (p.value ? 'Yes' : 'No'),
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
    [canEdit, canDelete]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Stage Master</h1>
          <p className="text-sm text-muted-foreground">Manage task statuses and kanban columns.</p>
        </div>
        {canAdd && (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add Stage
          </Button>
        )}
      </div>

      <FilterBar search={search} onSearchChange={setSearch} placeholder="Search stages…" />

      <DataTable columnDefs={columnDefs} rowData={data} loading={isLoading} />

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? 'Edit Stage' : 'Add Stage'}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} disabled={create.isPending || update.isPending}>
              {editing ? 'Update Stage' : 'Create Stage'}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField label="Name" htmlFor="name" required error={form.formState.errors.name?.message}>
            <Input id="name" {...form.register('name')} />
          </FormField>
          <FormRow>
            <FormField label="Color" htmlFor="color">
              <Input id="color" type="color" {...form.register('color')} className="h-10 p-1" />
            </FormField>
            <FormField label="Order" htmlFor="order">
              <Input id="order" type="number" {...form.register('order', { valueAsNumber: true })} />
            </FormField>
          </FormRow>
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
        title="Delete stage?"
        message="This cannot be undone. Stages in use by tasks cannot be deleted later."
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
