import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const MODULE_LABELS = {
  tasks: 'Tasks',
  clients: 'Clients',
  users: 'Users',
  services: 'Services',
  projects: 'Projects',
  stages: 'Stages',
  closing_note_stages: 'Closing Note Stages',
  alerts: 'Alerts',
  reports: 'Reports',
  permissions: 'Permissions',
  settings: 'Settings',
}

const BASE_ACTIONS = [
  { key: 'view', label: 'View' },
  { key: 'add', label: 'Add' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
]

const TASK_ACTIONS = [
  { key: 'complete', label: 'Complete' },
  { key: 'ignore', label: 'Ignore' },
  { key: 'editBudgetHours', label: 'Edit budget' },
  { key: 'editLoggedTime', label: 'Edit logged time' },
  { key: 'editTargetDate', label: 'Edit target date' },
]

function emptyActions() {
  return {
    view: false,
    add: false,
    edit: false,
    delete: false,
    editBudgetHours: false,
    editLoggedTime: false,
    complete: false,
    ignore: false,
    editTargetDate: false,
  }
}

export default function PermissionsPage() {
  const qc = useQueryClient()
  const [role, setRole] = useState('manager')
  const [draft, setDraft] = useState({})

  const { data, isLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data } = await api.get('/permissions')
      return data
    },
  })

  const modules = data?.modules || Object.keys(MODULE_LABELS)
  const rows = data?.data || []

  useEffect(() => {
    const next = {}
    for (const row of rows) {
      if (row.role !== role) continue
      next[row.module] = { ...emptyActions(), ...row.actions }
    }
    setDraft(next)
  }, [rows, role])

  const dirtyItems = useMemo(() => {
    const items = []
    for (const module of modules) {
      const current = rows.find((r) => r.role === role && r.module === module)
      const next = draft[module]
      if (!current || !next) continue
      const changed = BASE_ACTIONS.concat(TASK_ACTIONS).some(
        ({ key }) => Boolean(current.actions?.[key]) !== Boolean(next[key])
      )
      if (changed) {
        items.push({ role, module, actions: next })
      }
    }
    return items
  }, [draft, modules, role, rows])

  const save = useMutation({
    mutationFn: (items) => api.patch('/permissions', { items }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Permissions updated')
      qc.invalidateQueries({ queryKey: ['permissions'] })
      qc.invalidateQueries({ queryKey: ['permissions', 'me'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update permissions'),
  })

  function toggle(module, action, checked) {
    setDraft((prev) => ({
      ...prev,
      [module]: {
        ...emptyActions(),
        ...prev[module],
        [action]: checked,
      },
    }))
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control what managers and staff can do. Owners and super admins always have full access.
          Alert options can be added or edited only by users with Alerts add/edit/delete permission.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {['manager', 'staff'].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors',
              role === r
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-indigo-100 bg-indigo-50/80">
            <tr>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-indigo-900">Module</th>
              {BASE_ACTIONS.map((a) => (
                <th key={a.key} className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wide text-indigo-900">
                  {a.label}
                </th>
              ))}
              {TASK_ACTIONS.map((a) => (
                <th key={a.key} className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wide text-indigo-700">
                  {a.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={1 + BASE_ACTIONS.length + TASK_ACTIONS.length} className="px-4 py-8 text-center text-muted-foreground">
                  Loading permissions…
                </td>
              </tr>
            ) : (
              modules.map((module) => {
                const actions = draft[module] || emptyActions()
                return (
                  <tr key={module} className="border-b border-border last:border-0 even:bg-slate-50/70 hover:bg-indigo-50/40">
                    <td className="px-4 py-3 font-bold text-slate-800">
                      {MODULE_LABELS[module] || module}
                      {module === 'alerts' ? (
                        <p className="text-xs font-normal text-muted-foreground">
                          Manage alert intervals on the task form
                        </p>
                      ) : null}
                    </td>
                    {BASE_ACTIONS.map((a) => (
                      <td key={a.key} className="px-3 py-3 text-center">
                        <div className="flex justify-center">
                          <Switch
                            checked={Boolean(actions[a.key])}
                            onCheckedChange={(v) => toggle(module, a.key, v)}
                          />
                        </div>
                      </td>
                    ))}
                    {TASK_ACTIONS.map((a) => (
                      <td key={a.key} className="px-3 py-3 text-center">
                        {module === 'tasks' ? (
                          <div className="flex justify-center">
                            <Switch
                              checked={Boolean(actions[a.key])}
                              onCheckedChange={(v) => toggle(module, a.key, v)}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => save.mutate(dirtyItems)}
          disabled={save.isPending || dirtyItems.length === 0}
        >
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}
