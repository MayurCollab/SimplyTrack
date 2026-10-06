import { useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { usePermission } from '@/hooks/usePermissions'
import {
  downloadMonthlyReport,
  useMonthlyReportJobLogs,
  useMonthlyReportRuns,
} from '@/hooks/useSettings'
import { DataTable } from '@/components/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'

function formatWhen(value, timezone) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || 'Asia/Kolkata',
    }).format(new Date(value))
  } catch {
    return new Date(value).toLocaleString()
  }
}

function statusVariant(status) {
  if (status === 'success') return 'success'
  if (status === 'partial') return 'warning'
  if (status === 'failed') return 'destructive'
  return 'default'
}

export default function ReportsPage() {
  const { allowed: canView } = usePermission('reports', 'view')
  const [includeTests, setIncludeTests] = useState(false)
  const { data = [], isLoading, refetch, isFetching } = useMonthlyReportRuns(includeTests)
  const {
    data: jobLogs = [],
    isLoading: logsLoading,
    refetch: refetchLogs,
  } = useMonthlyReportJobLogs()

  const columnDefs = useMemo(
    () => [
      {
        field: 'periodKey',
        headerName: 'Period',
        width: 120,
        cellRenderer: (p) => (
          <span className="font-medium text-slate-800">
            {p.value}
            {p.data?.isTest ? (
              <Badge className="ml-2" variant="warning">
                Test
              </Badge>
            ) : null}
          </span>
        ),
      },
      {
        field: 'generatedAt',
        headerName: 'Generated',
        flex: 1.2,
        valueGetter: (p) => formatWhen(p.data?.generatedAt || p.data?.finishedAt, p.data?.timezone),
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 120,
        cellRenderer: (p) => (
          <Badge variant={statusVariant(p.value)} className="capitalize">
            {p.value}
          </Badge>
        ),
      },
      {
        headerName: 'Tasks',
        width: 90,
        valueGetter: (p) => p.data?.summary?.totalTasks ?? '—',
      },
      {
        headerName: 'Recipients',
        width: 110,
        valueGetter: (p) => {
          const delivery = p.data?.delivery || []
          if (!delivery.length) return '—'
          const sent = delivery.filter((d) => d.status === 'sent').length
          return `${sent}/${delivery.length}`
        },
      },
      {
        headerName: '',
        width: 130,
        sortable: false,
        cellRenderer: (p) => {
          if (!p.data?.hasFile) {
            return <span className="text-xs text-slate-400">No file</span>
          }
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await downloadMonthlyReport(p.data._id, p.data.fileName)
                } catch {
                  toast.error('Failed to download report')
                }
              }}
            >
              <Download className="mr-1.5 size-3.5" />
              Excel
            </Button>
          )
        },
      },
    ],
    []
  )

  if (!canView) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500">You do not have permission to view reports.</p>
      </div>
    )
  }

  function refreshAll() {
    refetch()
    refetchLogs()
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monthly Status Report history. Each month’s Excel is stored as a snapshot — download the
            exact file from that run (manager → team member grouping). Scheduled on the 1st at 06:00
            IST for the previous month.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Switch checked={includeTests} onCheckedChange={setIncludeTests} />
            Show tests
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={isFetching || logsLoading}
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${isFetching || logsLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Cron job logs</h2>
        <p className="text-xs text-slate-500">
          One log per scheduled run (1st · 06:00 IST). Shows whether the job ran and this
          organisation’s result.
        </p>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Run date</th>
                <th className="px-3 py-2 font-medium">Period</th>
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">This org</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {logsLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-slate-500">
                    Loading logs…
                  </td>
                </tr>
              ) : jobLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-slate-500">
                    No cron job logs yet. Logs appear after the 1st-of-month 06:00 IST run.
                  </td>
                </tr>
              ) : (
                jobLogs.map((log) => (
                  <tr key={log._id} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap">{log.runDateKey}</td>
                    <td className="px-3 py-2 font-medium">{log.periodKey}</td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(log.status)} className="capitalize">
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {log.orgResult ? (
                        <span className="capitalize">
                          {log.orgResult.status}
                          {log.orgResult.reason ? (
                            <span className="text-xs text-slate-400"> ({log.orgResult.reason})</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                      {formatWhen(log.startedAt, log.timezone)}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-500">
                      {log.errorMessage || log.message || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Saved report files</h2>
        <DataTable rowData={data} columnDefs={columnDefs} loading={isLoading} height={420} />
      </section>
    </div>
  )
}
