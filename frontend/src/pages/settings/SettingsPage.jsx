import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { usePermission } from '@/hooks/usePermissions'
import {
  useSettings,
  useSettingsMutation,
  useMonthlyReportTestSend,
} from '@/hooks/useSettings'
import { getTimezoneOptions, normalizeTimezone } from '@/lib/timezones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { FormField } from '@/components/ui/form-field'
import { Badge } from '@/components/ui/badge'

const TIMEZONES = getTimezoneOptions()

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

export default function SettingsPage() {
  const { allowed: canView } = usePermission('settings', 'view')
  const { allowed: canEdit } = usePermission('settings', 'edit')
  const { data, isLoading } = useSettings()
  const saveMutation = useSettingsMutation()
  // TEMPORARY: comment out after QA — test mail against production SMTP from local UI
  const SHOW_TEST_SEND = true
  const testSend = useMonthlyReportTestSend()

  const settings = data?.data
  const columnsMeta = data?.meta?.monthlyReportColumns || []
  const recipientOptions = data?.meta?.recipientOptions || []

  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [enabled, setEnabled] = useState(false)
  const [recipientUserIds, setRecipientUserIds] = useState([])
  const [externalEmails, setExternalEmails] = useState([])
  const [externalDraft, setExternalDraft] = useState('')
  const [selectedColumns, setSelectedColumns] = useState([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!settings) return
    const msr = settings.monthlyStatusReport || {}
    setTimezone(normalizeTimezone(settings.defaultTimezone || 'Asia/Kolkata'))
    setEnabled(Boolean(msr.enabled))
    setRecipientUserIds(msr.recipientUserIds || [])
    setExternalEmails(msr.externalEmails || [])
    setSelectedColumns(msr.selectedColumns || [])
    setDirty(false)
  }, [settings])

  const recipientSet = useMemo(() => new Set(recipientUserIds), [recipientUserIds])
  const columnSet = useMemo(() => new Set(selectedColumns), [selectedColumns])

  if (!canView) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500">You do not have permission to view settings.</p>
      </div>
    )
  }

  function markDirty() {
    setDirty(true)
  }

  function toggleRecipient(userId) {
    if (!canEdit) return
    setRecipientUserIds((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId)
      return [...prev, userId]
    })
    markDirty()
  }

  function toggleColumn(key) {
    if (!canEdit) return
    setSelectedColumns((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) {
          toast.error('Select at least one column')
          return prev
        }
        return prev.filter((k) => k !== key)
      }
      return [...prev, key]
    })
    markDirty()
  }

  function addExternalEmail() {
    if (!canEdit) return
    const email = externalDraft.trim().toLowerCase()
    if (!email) return
    if (!isValidEmail(email)) {
      toast.error('Enter a valid email address')
      return
    }
    if (externalEmails.includes(email)) {
      toast.error('Email already added')
      return
    }
    setExternalEmails((prev) => [...prev, email])
    setExternalDraft('')
    markDirty()
  }

  function removeExternalEmail(email) {
    if (!canEdit) return
    setExternalEmails((prev) => prev.filter((e) => e !== email))
    markDirty()
  }

  async function onSave() {
    if (!canEdit) return
    if (enabled && recipientUserIds.length === 0 && externalEmails.length === 0) {
      toast.error('Add at least one recipient before enabling the report')
      return
    }
    await saveMutation.mutateAsync({
      defaultTimezone: timezone,
      monthlyStatusReport: {
        enabled,
        recipientUserIds,
        externalEmails,
        selectedColumns,
      },
    })
    setDirty(false)
  }

  async function onTestSend() {
    if (!canEdit) return
    await testSend.mutateAsync({ onlyMe: true })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Organisation preferences and monthly status report delivery.
          </p>
        </div>
        {canEdit && (
          <Button onClick={onSave} disabled={!dirty || saveMutation.isPending || isLoading}>
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading settings…</p>
      ) : (
        <>
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Organisation</h2>
            <FormField label="Timezone" htmlFor="defaultTimezone">
              <Select
                id="defaultTimezone"
                value={timezone}
                disabled={!canEdit}
                onChange={(e) => {
                  setTimezone(normalizeTimezone(e.target.value))
                  markDirty()
                }}
              >
                {!TIMEZONES.includes(timezone) && (
                  <option value={timezone}>{timezone}</option>
                )}
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </FormField>
            <p className="text-xs text-slate-500">
              Used for date formatting in the report. The scheduled job always runs in IST
              (`Asia/Kolkata`).
            </p>
          </section>

          <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Monthly Status Report</h2>
              <p className="mt-1 text-sm text-slate-500">
                One organisation-wide Excel email on the <strong>1st of every month at 06:00 IST</strong>,
                covering the <strong>previous calendar month</strong> (e.g. 1 Oct sends September).
                Tasks are grouped by manager, then by team member. Status matches the Tasks module
                status column (workflow stage). The Excel file is stored so you can redownload that
                exact snapshot later.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Enable monthly status report</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  When enabled, the previous month’s report is emailed automatically on the 1st at
                  06:00 IST.
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={!canEdit}
                onCheckedChange={(v) => {
                  setEnabled(v)
                  markDirty()
                }}
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-slate-800">Fixed schedule</p>
              <p className="mt-1 text-xs text-slate-500">
                Day 1 of each month · 06:00 IST · previous month’s data. Send time is not configurable
                for now.
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-800">Recipients (users)</p>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {recipientOptions.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-slate-500">No active users found.</p>
                ) : (
                  recipientOptions.map((user) => {
                    const checked = recipientSet.has(user._id)
                    return (
                      <label
                        key={user._id}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="size-4 rounded border-slate-300"
                          checked={checked}
                          disabled={!canEdit}
                          onChange={() => toggleRecipient(user._id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {user.name}
                          </span>
                          <span className="block truncate text-xs text-slate-500">{user.email}</span>
                        </span>
                        <Badge className="capitalize">{user.role}</Badge>
                      </label>
                    )
                  })
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-800">External emails</p>
              <div className="flex gap-2">
                <Input
                  value={externalDraft}
                  disabled={!canEdit}
                  placeholder="name@example.com"
                  onChange={(e) => setExternalDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addExternalEmail()
                    }
                  }}
                />
                <Button type="button" variant="outline" disabled={!canEdit} onClick={addExternalEmail}>
                  Add
                </Button>
              </div>
              {externalEmails.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {externalEmails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                    >
                      {email}
                      {canEdit && (
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-slate-200"
                          onClick={() => removeExternalEmail(email)}
                          aria-label={`Remove ${email}`}
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-800">Excel columns</p>
              <p className="mb-2 text-xs text-slate-500">
                Choose which columns appear in the attached workbook. Manager and team member grouping
                always appear as section headers.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {columnsMeta.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="size-4 rounded border-slate-300"
                      checked={columnSet.has(col.key)}
                      disabled={!canEdit}
                      onChange={() => toggleColumn(col.key)}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </div>

            {/* TEMPORARY: comment out this block after testing */}
            {SHOW_TEST_SEND && canEdit && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-900">Send test report</p>
                <p className="mt-1 text-xs text-amber-800">
                  Generates a snapshot with your saved columns and emails only you (production SMTP).
                  Rate-limited to once every 5 minutes. Comment out this UI after QA.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  disabled={testSend.isPending}
                  onClick={onTestSend}
                >
                  {testSend.isPending ? 'Sending…' : 'Send test to my email'}
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
