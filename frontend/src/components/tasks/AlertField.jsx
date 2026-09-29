import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Check, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useAlerts, useAlertMutations } from '@/hooks/useMasters'
import { usePermissions } from '@/hooks/usePermissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

export function AlertField({ value, onChange }) {
  const { can } = usePermissions()
  const canAdd = can('alerts', 'add')
  const canEdit = can('alerts', 'edit')
  const canDelete = can('alerts', 'delete')
  const canManage = canAdd || canEdit || canDelete

  const { data: alerts = [], isLoading } = useAlerts()
  const { create, update, remove } = useAlertMutations()

  const selected = useMemo(
    () => alerts.find((a) => a._id === value) || null,
    [alerts, value]
  )

  const [open, setOpen] = useState(Boolean(value))
  const [newName, setNewName] = useState('')
  const [newDays, setNewDays] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDays, setEditDays] = useState('')
  const [deleteId, setDeleteId] = useState(null)

  useEffect(() => {
    if (value) setOpen(true)
  }, [value])

  function startEdit(alert) {
    setEditingId(alert._id)
    setEditName(alert.name)
    setEditDays(String(alert.days ?? ''))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditDays('')
  }

  async function saveEdit() {
    const name = editName.trim()
    const days = Number(editDays)
    if (!name || !Number.isFinite(days) || days < 1) return
    await update.mutateAsync({ id: editingId, name, days })
    cancelEdit()
  }

  async function addAlert() {
    const name = newName.trim()
    const days = Number(newDays)
    if (!name || !Number.isFinite(days) || days < 1) return
    const res = await create.mutateAsync({ name, days })
    const created = res.data?.data
    setNewName('')
    setNewDays('')
    if (created?._id) onChange(created._id)
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Bell className="size-4 shrink-0 text-primary" />
          <span className="text-sm font-medium text-foreground">Alert</span>
          {selected ? (
            <span className="truncate rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {selected.name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Optional</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 border-t border-border px-3 py-3">
            <p className="text-xs text-muted-foreground">
              Remind before the due date. Leave unselected if you do not need an alert.
            </p>

            <div className="overflow-hidden rounded-lg border border-border">
              <button
                type="button"
                onClick={() => onChange('')}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                  !value ? 'bg-primary/5 font-medium text-primary' : 'text-foreground'
                )}
              >
                None
                {!value ? <Check className="size-3.5" /> : null}
              </button>

              {isLoading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Loading alerts…</p>
              ) : alerts.length === 0 && !canAdd ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No alerts configured.</p>
              ) : (
                alerts.map((alert) => {
                  const isSelected = value === alert._id
                  const isEditing = editingId === alert._id

                  return (
                    <div
                      key={alert._id}
                      className={cn(
                        'flex items-center gap-1 border-t border-border px-2 py-1',
                        isSelected && !isEditing && 'bg-primary/5'
                      )}
                    >
                      {isEditing ? (
                        <>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8"
                            placeholder="Name"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                saveEdit()
                              }
                              if (e.key === 'Escape') cancelEdit()
                            }}
                          />
                          <Input
                            type="number"
                            min={1}
                            value={editDays}
                            onChange={(e) => setEditDays(e.target.value)}
                            className="h-8 w-20"
                            placeholder="Days"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                saveEdit()
                              }
                              if (e.key === 'Escape') cancelEdit()
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-8 px-0 text-green-600"
                            onClick={saveEdit}
                            disabled={update.isPending}
                            title="Save"
                          >
                            <Check className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-8 px-0"
                            onClick={cancelEdit}
                            title="Cancel"
                          >
                            <X className="size-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onChange(alert._id)}
                            className={cn(
                              'flex min-w-0 flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60',
                              isSelected ? 'font-medium text-primary' : 'text-foreground'
                            )}
                          >
                            <span className="truncate">{alert.name}</span>
                            <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                              {alert.days}d
                            </span>
                          </button>
                          {canEdit && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="size-8 shrink-0 px-0 text-muted-foreground hover:text-foreground"
                              onClick={() => startEdit(alert)}
                              title="Edit"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="size-8 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteId(alert._id)}
                              title="Delete"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )
                })
              )}

              {canAdd && (
                <div className="flex items-center gap-1 border-t border-border bg-muted/30 px-2 py-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-8"
                    placeholder="New alert name"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addAlert()
                      }
                    }}
                  />
                  <Input
                    type="number"
                    min={1}
                    value={newDays}
                    onChange={(e) => setNewDays(e.target.value)}
                    className="h-8 w-20"
                    placeholder="Days"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addAlert()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 shrink-0 px-2"
                    onClick={addAlert}
                    disabled={create.isPending || !newName.trim() || Number(newDays) < 1}
                    title="Add alert"
                  >
                    <Plus className="size-3.5" />
                    Add
                  </Button>
                </div>
              )}
            </div>

            {!canManage && (
              <p className="text-xs text-muted-foreground">
                Only users with alert permissions can add or edit these options.
              </p>
            )}
          </div>
        </div>
      </div>

      {createPortal(
        <ConfirmDialog
          open={!!deleteId}
          title="Delete alert?"
          message="This removes the option from the list. Existing tasks keep their current selection until changed."
          loading={remove.isPending}
          onCancel={() => setDeleteId(null)}
          onConfirm={async () => {
            const id = deleteId
            await remove.mutateAsync(id)
            if (value === id) onChange('')
            setDeleteId(null)
          }}
        />,
        document.body
      )}
    </div>
  )
}
