import { useMemo, useState } from 'react'
import { Camera, Download, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { usePermission } from '@/hooks/usePermissions'
import {
  downloadDailyStatusReport,
  downloadMonthlyReport,
  useCaptureDailySnapshot,
  useDailyStatusDetail,
  useDailyStatusSnapshots,
  useMonthlyReportJobLogs,
  useMonthlyReportRuns,
} from '@/hooks/useSettings'
import { useUsers } from '@/hooks/useMasters'
import { DataTable } from '@/components/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

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

function twoDaysAgoIso() {
  const d = new Date()
  d.setDate(d.getDate() - 2)
  return d.toISOString().slice(0, 10)
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

  const {
    data: dailyPayload,
    isLoading: dailyLoading,
    refetch: refetchDaily,
  } = useDailyStatusSnapshots()
  const dailyList = dailyPayload?.list || []
  const dailyMeta = dailyPayload?.meta || {}
  const captureDaily = useCaptureDailySnapshot()
  const { data: users = [] } = useUsers()

  const [dailyDate, setDailyDate] = useState(twoDaysAgoIso)
  const [dailyUserId, setDailyUserId] = useState('')
  const [downloadingDaily, setDownloadingDaily] = useState(false)

  const availableDates = useMemo(
    () => new Set(dailyList.map((s) => s.dateKey)),
    [dailyList]
  )

  const {
    data: dailyDetail,
    isFetching: detailLoading,
    isError: detailError,
    error: detailErr,
    refetch: refetchDetail,
  } = useDailyStatusDetail(dailyDate, dailyUserId)

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
    refetchDaily()
  }

  async function handleDailyDownload() {
    if (!dailyDate) {
      toast.error('Choose a snapshot date')
      return
    }
    setDownloadingDaily(true)
    try {
      await downloadDailyStatusReport({
        date: dailyDate,
        userId: dailyUserId || undefined,
      })
      toast.success('Report downloaded')
    } catch (err) {
      toast.error(err?.message || 'Failed to download daily report')
    } finally {
      setDownloadingDaily(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Download historical daily status (saved every night at 12:00 AM IST) or monthly emailed
            Excel files.
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
            disabled={isFetching || logsLoading || dailyLoading}
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${isFetching || logsLoading || dailyLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Daily task status (auto-saved in database)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Saved automatically every night at <strong>12:00 AM IST</strong> (and on server start if
            a day was missed). Not emailed. Pick a date and All members or one member — report shows{' '}
            <strong>Manager → team → full task list</strong> with each task’s status.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="daily-date">Date</Label>
            <Input
              id="daily-date"
              type="date"
              value={dailyDate}
              max={dailyMeta.yesterdayKey || undefined}
              onChange={(e) => setDailyDate(e.target.value)}
            />
            {dailyDate && !availableDates.has(dailyDate) ? (
              <p className="text-[11px] text-amber-700">
                Not in DB yet for this date (auto-save runs at midnight IST). You can force-save
                below.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="daily-member">Member</Label>
            <Select
              id="daily-member"
              value={dailyUserId}
              onChange={(e) => setDailyUserId(e.target.value)}
            >
              <option value="">All members</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                  {u.role ? ` (${u.role})` : ''}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2">
            <Button
              onClick={handleDailyDownload}
              disabled={downloadingDaily || !dailyDate || detailError}
              className="gap-1.5"
            >
              <Download className="size-3.5" />
              {downloadingDaily ? 'Preparing…' : 'Download Excel'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={captureDaily.isPending}
              className="gap-1.5"
              title="Only needed if midnight auto-save was missed"
              onClick={() =>
                captureDaily.mutate(
                  { date: dailyDate || dailyMeta.yesterdayKey },
                  {
                    onSuccess: () => {
                      refetchDaily()
                      refetchDetail()
                    },
                  }
                )
              }
            >
              <Camera className="size-3.5" />
              {captureDaily.isPending ? 'Saving…' : 'Force save'}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {dailyUserId ? 'Selected member' : 'All members'} · {dailyDate || '—'}
            {detailLoading ? ' · loading…' : ''}
            {dailyDetail
              ? ` · ${dailyDetail.managerCount ?? dailyDetail.managers?.length ?? 0} manager section(s) · ${dailyDetail.taskCount ?? 0} tasks`
              : ''}
          </p>
          {detailError ? (
            <p className="text-sm text-amber-800">
              {detailErr?.response?.data?.message ||
                detailErr?.message ||
                'No snapshot in database for this date.'}
            </p>
          ) : !dailyDetail ? (
            <p className="text-sm text-slate-500">
              Choose a date that was auto-saved, or use Force save once.
            </p>
          ) : (
            <div className="space-y-5">
              {(dailyDetail.managers || []).map((mgr) => (
                <div
                  key={String(mgr.managerId || mgr.managerName)}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-indigo-700 px-3 py-2.5 text-white">
                    <p className="text-sm font-semibold">
                      Manager: {mgr.managerName}
                    </p>
                    <p className="text-xs text-indigo-100">
                      {mgr.memberCount} team member(s) · {mgr.taskCount} task(s)
                    </p>
                  </div>

                  <div className="space-y-3 p-3">
                    {(mgr.members || []).map((m) => (
                      <div
                        key={String(m.userId || m.userName)}
                        className="overflow-hidden rounded-lg border border-slate-200"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-indigo-50/70 px-3 py-2">
                          <p className="text-sm font-semibold text-slate-900">
                            {m.userName}
                          </p>
                          <p className="text-xs text-slate-600">
                            {m.total} assigned ·{' '}
                            <span className="text-amber-700">{m.working} working</span> ·{' '}
                            <span className="text-emerald-700">{m.completed} completed</span>
                            {m.ignored ? (
                              <>
                                {' '}
                                · <span className="text-slate-500">{m.ignored} ignored</span>
                              </>
                            ) : null}
                          </p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                              <tr>
                                <th className="px-3 py-1.5 font-medium">Code</th>
                                <th className="px-3 py-1.5 font-medium">Task</th>
                                <th className="px-3 py-1.5 font-medium">Client</th>
                                <th className="px-3 py-1.5 font-medium">Service</th>
                                <th className="px-3 py-1.5 font-medium">Stage</th>
                                <th className="px-3 py-1.5 font-medium">Status</th>
                                <th className="px-3 py-1.5 font-medium">Priority</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(m.tasks || []).length === 0 ? (
                                <tr>
                                  <td
                                    colSpan={7}
                                    className="px-3 py-3 text-slate-500"
                                  >
                                    No tasks for this member on this date.
                                  </td>
                                </tr>
                              ) : (
                                (m.tasks || []).map((t) => (
                                  <tr
                                    key={String(t.taskId)}
                                    className="border-t border-slate-50"
                                  >
                                    <td className="px-3 py-1.5 font-mono text-xs text-slate-600">
                                      {t.taskCode || '—'}
                                    </td>
                                    <td className="px-3 py-1.5 text-slate-800">{t.title}</td>
                                    <td className="px-3 py-1.5 text-slate-600">
                                      {t.clientName || '—'}
                                    </td>
                                    <td className="px-3 py-1.5 text-slate-600">
                                      {t.serviceName || '—'}
                                    </td>
                                    <td className="px-3 py-1.5 text-slate-600">
                                      {t.stageName || '—'}
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <Badge
                                        variant={
                                          t.lifecycle === 'Completed'
                                            ? 'success'
                                            : t.lifecycle === 'Ignored'
                                              ? 'default'
                                              : 'warning'
                                        }
                                      >
                                        {t.lifecycle || 'Working'}
                                      </Badge>
                                    </td>
                                    <td className="px-3 py-1.5 capitalize text-slate-600">
                                      {t.priority || '—'}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-100">
          <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
            Auto-saved dates in database
          </p>
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Saved at</th>
                <th className="px-3 py-2 font-medium">Members</th>
                <th className="px-3 py-2 font-medium">Tasks</th>
                <th className="px-3 py-2 font-medium">Working</th>
                <th className="px-3 py-2 font-medium">Completed</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {dailyLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : dailyList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-slate-500">
                    No auto-saves yet. Restart the API (catch-up runs on boot) or wait for midnight
                    IST.
                  </td>
                </tr>
              ) : (
                dailyList.slice(0, 14).map((s) => (
                  <tr key={s._id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">{s.dateKey}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {formatWhen(s.capturedAt, 'Asia/Kolkata')}
                    </td>
                    <td className="px-3 py-2">{s.memberCount ?? s.members?.length ?? '—'}</td>
                    <td className="px-3 py-2">{s.taskCount}</td>
                    <td className="px-3 py-2">{s.working ?? s.open}</td>
                    <td className="px-3 py-2">{s.completed}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-indigo-600"
                        onClick={() => setDailyDate(s.dateKey)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Monthly cron job logs</h2>
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
        <h2 className="text-sm font-semibold text-slate-900">Saved monthly report files</h2>
        <DataTable rowData={data} columnDefs={columnDefs} loading={isLoading} height={420} />
      </section>
    </div>
  )
}
