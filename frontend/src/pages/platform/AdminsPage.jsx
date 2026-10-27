import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { platformAdminSchema } from '@/lib/schemas'
import { useAppForm } from '@/hooks/useAppForm'
import { useAdminMutations, useAdmins } from '@/hooks/usePlatform'
import { useAuthStore } from '@/store/authStore'
import { DataTable } from '@/components/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { FormField } from '@/components/ui/form-field'
import { Sheet } from '@/components/ui/sheet'

const FORM_ID = 'admin-form'

function formatWhen(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return format(date, 'dd/MM/yyyy HH:mm')
}

export default function AdminsPage() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  const { data = [], isLoading } = useAdmins()
  const { create, updateStatus } = useAdminMutations()

  const activeCount = data.filter((admin) => admin.isActive !== false).length

  const form = useAppForm({
    resolver: zodResolver(platformAdminSchema),
    defaultValues: { name: '', email: '' },
  })

  function openCreate() {
    form.reset({ name: '', email: '' })
    setSheetOpen(true)
  }

  async function onSubmit(values) {
    await create.mutateAsync(values)
    setSheetOpen(false)
  }

  const columnDefs = useMemo(
    () => [
      { field: 'name', headerName: 'Name', flex: 1.4, cellClass: 'cell-emphasis' },
      { field: 'email', headerName: 'Email', flex: 2 },
      {
        field: 'lastLoginAt',
        headerName: 'Last login',
        width: 170,
        valueFormatter: (p) => formatWhen(p.value),
      },
      {
        field: 'createdAt',
        headerName: 'Added',
        width: 160,
        valueFormatter: (p) => formatWhen(p.value),
      },
      {
        field: 'isActive',
        headerName: 'Active',
        width: 110,
        cellRenderer: (p) => {
          const isSelf = String(p.data._id) === String(user?.id)
          const lastActive = p.value !== false && activeCount <= 1
          return (
            <div className="flex h-full items-center">
              <Switch
                checked={p.value !== false}
                disabled={updateStatus.isPending || isSelf || lastActive}
                onCheckedChange={(isActive) =>
                  updateStatus.mutate({ id: p.data._id, isActive })
                }
              />
            </div>
          )
        },
      },
    ],
    [activeCount, updateStatus, user?.id]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Admins</h1>
          <p className="text-sm text-muted-foreground">
            Add another admin with a new email. They sign in with their own one-time code.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Add admin
        </Button>
      </div>

      <DataTable columnDefs={columnDefs} rowData={data} loading={isLoading} height={480} />

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Add admin"
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} disabled={create.isPending}>
              Add admin
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField label="Name" htmlFor="admin-name" required error={form.formState.errors.name?.message}>
            <Input id="admin-name" {...form.register('name')} />
          </FormField>
          <FormField
            label="Email"
            htmlFor="admin-email"
            required
            error={form.formState.errors.email?.message}
          >
            <Input id="admin-email" type="email" autoComplete="off" {...form.register('email')} />
          </FormField>
        </form>
      </Sheet>
    </div>
  )
}
