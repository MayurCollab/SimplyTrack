import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import {
  useEnterOrganization,
  useOrganizationStatus,
  useOrganizations,
} from '@/hooks/usePlatform'
import { DataTable } from '@/components/data-table/DataTable'
import { FilterBar } from '@/components/data-table/FilterBar'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

function formatWhen(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return format(date, 'dd/MM/yyyy HH:mm')
}

export default function OrganizationsPage() {
  const [search, setSearch] = useState('')
  const user = useAuthStore((s) => s.user)
  const { data = [], isLoading } = useOrganizations()
  const updateStatus = useOrganizationStatus()
  const enter = useEnterOrganization()

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return data
    return data.filter((org) =>
      [org.name, org.ownerName, org.ownerEmail].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(query)
      )
    )
  }, [data, search])

  const columnDefs = useMemo(
    () => [
      { field: 'name', headerName: 'Organization', flex: 1.4, cellClass: 'cell-emphasis' },
      {
        field: 'ownerName',
        headerName: 'Owner',
        flex: 1.6,
        cellRenderer: (p) => (
          <div className="flex h-full flex-col justify-center leading-tight">
            <span className="font-medium text-slate-900">{p.data.ownerName || '—'}</span>
            <span className="text-xs text-muted-foreground">{p.data.ownerEmail || ''}</span>
          </div>
        ),
      },
      {
        field: 'createdAt',
        headerName: 'Created',
        width: 160,
        valueFormatter: (p) => formatWhen(p.value),
      },
      {
        field: 'ownerLastLoginAt',
        headerName: 'Owner last login',
        width: 170,
        valueFormatter: (p) => formatWhen(p.value),
      },
      {
        field: 'isActive',
        headerName: 'Active',
        width: 110,
        cellRenderer: (p) => (
          <div className="flex h-full items-center">
            <Switch
              checked={p.value !== false}
              disabled={updateStatus.isPending}
              onCheckedChange={(isActive) =>
                updateStatus.mutate({ id: p.data._id, isActive })
              }
            />
          </div>
        ),
      },
      {
        field: '_id',
        headerName: '',
        width: 120,
        sortable: false,
        cellRenderer: (p) => {
          const current = user?.actingOrganizationId && String(user.actingOrganizationId) === String(p.value)
          return (
            <div className="flex h-full items-center">
              <Button
                size="sm"
                variant={current ? 'secondary' : 'primary'}
                disabled={enter.isPending}
                onClick={() => enter.mutate(p.value)}
              >
                {current ? 'Current' : 'Open'}
              </Button>
            </div>
          )
        },
      },
    ],
    [enter, updateStatus, user?.actingOrganizationId]
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Organizations</h1>
        <p className="text-sm text-muted-foreground">
          Open a firm to review it, or turn access on and off. Inactive firms cannot sign in.
        </p>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search organizations or owners…"
      />

      <DataTable
        columnDefs={columnDefs}
        rowData={rows}
        loading={isLoading}
        height={560}
        rowHeight={52}
      />
    </div>
  )
}
