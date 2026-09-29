import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { userSchema } from '@/lib/schemas'
import { useAppForm } from '@/hooks/useAppForm'
import { usePermission } from '@/hooks/usePermissions'
import { useUsers, useUserMutations, useManagers } from '@/hooks/useMasters'
import { DataTable } from '@/components/data-table/DataTable'
import { FilterBar } from '@/components/data-table/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { FormField, FormSwitchRow } from '@/components/ui/form-field'
import { Sheet } from '@/components/ui/sheet'

const FORM_ID = 'user-form'

export default function UsersPage() {
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const { allowed: canAdd } = usePermission('users', 'add')
  const { allowed: canEdit } = usePermission('users', 'edit')

  const { data: allUsers = [], isLoading } = useUsers(search)
  const { data: managers = [] } = useManagers()
  const { create, update, updateStatus } = useUserMutations()

  const sortedManagers = useMemo(
    () => [...managers].sort((a, b) => a.name.localeCompare(b.name)),
    [managers]
  )

  const form = useAppForm({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'staff',
      reportingManagerId: '',
      isActive: true,
    },
  })

  const role = form.watch('role')

  function openCreate() {
    setEditing(null)
    form.reset({
      name: '',
      email: '',
      role: 'staff',
      reportingManagerId: '',
      isActive: true,
    })
    setSheetOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    form.reset({
      name: row.name,
      email: row.email,
      role: row.role,
      reportingManagerId: row.reportingManagerId?._id || row.reportingManagerId || '',
      isActive: row.isActive ?? true,
    })
    setSheetOpen(true)
  }

  async function onSubmit(values) {
    const payload = {
      ...values,
      reportingManagerId: values.role === 'staff' ? values.reportingManagerId : null,
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
      { field: 'name', headerName: 'Name', flex: 1.5, cellClass: 'cell-emphasis' },
      { field: 'email', headerName: 'Email', flex: 2 },
      {
        field: 'role',
        headerName: 'Role',
        width: 110,
        cellRenderer: (p) => {
          const variant =
            p.value === 'owner' || p.value === 'super_admin'
              ? 'indigo'
              : p.value === 'manager'
                ? 'sky'
                : 'outline'
          return (
            <Badge variant={variant} className="font-bold capitalize">
              {p.value?.replace('_', ' ')}
            </Badge>
          )
        },
      },
      {
        field: 'reportingManagerId',
        headerName: 'Reporting Manager',
        flex: 1.5,
        valueGetter: (p) => p.data.reportingManagerId?.name || '-',
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">User Master</h1>
          <p className="text-sm text-muted-foreground">Add managers and staff - login is passwordless via OTP.</p>
        </div>
        {canAdd && (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add User
          </Button>
        )}
      </div>

      <FilterBar search={search} onSearchChange={setSearch} placeholder="Search users…" />

      <DataTable columnDefs={columnDefs} rowData={allUsers} loading={isLoading} />

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? 'Edit User' : 'Add User'}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} disabled={create.isPending || update.isPending}>
              {editing ? 'Update User' : 'Create User'}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField label="Name" htmlFor="name" required error={form.formState.errors.name?.message}>
            <Input id="name" {...form.register('name')} />
          </FormField>
          <FormField label="Email" htmlFor="email" required error={form.formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          </FormField>
          <FormField label="Role" htmlFor="role" required>
            <Select id="role" {...form.register('role')}>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </Select>
          </FormField>
          {role === 'staff' && (
            <FormField
              label="Reporting Manager"
              htmlFor="reportingManagerId"
              required
              error={form.formState.errors.reportingManagerId?.message}
            >
              <Select id="reportingManagerId" {...form.register('reportingManagerId')}>
                <option value="">Select manager…</option>
                {sortedManagers.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </Select>
            </FormField>
          )}
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
