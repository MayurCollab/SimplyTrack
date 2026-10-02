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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

const FORM_ID = 'stage-form'

export default function StagesPage() {
  const [search, setSearch] = useState('')
  const [stageType, setStageType] = useState('workflow')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const { allowed: canAdd } = usePermission('stages', 'add')
  const { allowed: canEdit } = usePermission('stages', 'edit')
  const { allowed: canDelete } = usePermission('stages', 'delete')
  const { allowed: canAddClosing } = usePermission('closing_note_stages', 'add')
  const { allowed: canEditClosing } = usePermission('closing_note_stages', 'edit')
  const { allowed: canDeleteClosing } = usePermission('closing_note_stages', 'delete')

  const { data = [], isLoading } = useStages(search, stageType)
  const { create, update, remove } = useStageMutations()

  const perms =
    stageType === 'closing_note'
      ? { canAdd: canAddClosing, canEdit: canEditClosing, canDelete: canDeleteClosing }
      : { canAdd, canEdit, canDelete }

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
      await create.mutateAsync({ ...values, stageType })
    }
    setSheetOpen(false)
  }

  const columnDefs = useMemo(
    () => [
      { field: 'name', headerName: 'Name', flex: 2, cellClass: 'cell-emphasis' },
      ...(stageType === 'workflow'
        ? [
            {
              field: 'systemKey',
              headerName: 'Workflow',
              width: 140,
              valueFormatter: (p) => (p.value ? p.value.replace(/_/g, ' ') : '-'),
              cellClass: 'text-xs capitalize text-muted-foreground',
            },
          ]
        : []),
      {
        field: 'color',
        headerName: 'Color',
        width: 100,
        cellRenderer: (p) => (
          <span className="flex items-center gap-2 font-semibold text-slate-700">
            <span className="size-4 rounded-full border border-border shadow-sm" style={{ background: p.value }} />
            {p.value}
          </span>
        ),
      },
      { field: 'order', headerName: 'Order', width: 90, cellClass: 'cell-emphasis' },
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
            {perms.canEdit && (
              <button type="button" onClick={() => openEdit(p.data)} className="rounded p-1 hover:bg-muted">
                <Pencil className="size-4 text-muted-foreground" />
              </button>
            )}
            {perms.canDelete && !p.data.systemKey && (
              <button type="button" onClick={() => setDeleteId(p.data._id)} className="rounded p-1 hover:bg-muted">
                <Trash2 className="size-4 text-destructive" />
              </button>
            )}
          </div>
        ),
      },
    ],
    [perms.canEdit, perms.canDelete, stageType]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {stageType === 'closing_note' ? 'Closing Note Stages' : 'Stage Master'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {stageType === 'closing_note'
              ? 'Manage searchable stages used in closing notes.'
              : 'Manage task statuses. System workflow stages cannot be deleted.'}
          </p>
        </div>
        {perms.canAdd && (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add {stageType === 'closing_note' ? 'Closing Note Stage' : 'Stage'}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={stageType === 'workflow' ? 'primary' : 'secondary'}
          onClick={() => setStageType('workflow')}
        >
          Workflow Stages
        </Button>
        <Button
          type="button"
          variant={stageType === 'closing_note' ? 'primary' : 'secondary'}
          onClick={() => setStageType('closing_note')}
        >
          Closing Note Stages
        </Button>
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
          {editing?.systemKey && (
            <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              System workflow status (<span className="font-mono">{editing.systemKey}</span>). You can
              rename or recolor it, but it cannot be deleted.
            </p>
          )}
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
        message={
          stageType === 'closing_note'
            ? 'This cannot be undone. Stages used in closing notes cannot be deleted later.'
            : 'This cannot be undone. Stages in use by tasks cannot be deleted later.'
        }
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
