import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  CheckSquare,
  Layers,
  Users,
  Building2,
  FolderKanban,
  Wrench,
  BarChart3,
  Shield,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { Logo } from '@/components/shared/Logo'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, module: 'tasks' },
  { to: '/stages', label: 'Stages', icon: Layers, module: 'stages' },
  { to: '/users', label: 'Users', icon: Users, module: 'users' },
  { to: '/clients', label: 'Clients', icon: Building2 },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/services', label: 'Services', icon: Wrench },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/permissions', label: 'Permissions', icon: Shield, roles: ['owner', 'super_admin'] },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const SIDEBAR_COLLAPSED_KEY = 'simplytrack-sidebar-collapsed'
const TRANSITION_MS = 300
const EASE = 'ease-[cubic-bezier(0.4,0,0.2,1)]'

function NavItem({ to, label, icon: Icon, collapsed, showTooltip }) {
  return (
    <div className="group relative">
      <NavLink
        to={to}
        title={showTooltip ? undefined : label}
        className={({ isActive }) =>
          cn(
            'relative flex items-center overflow-hidden rounded-lg text-sm font-medium',
            `transition-all duration-300 ${EASE}`,
            collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2',
            isActive
              ? 'bg-primary/10 text-primary shadow-sm'
              : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          )
        }
      >
        <Icon className="size-4 shrink-0" />
        <span
          className={cn(
            'truncate whitespace-nowrap',
            `transition-[max-width,opacity,margin] duration-300 ${EASE}`,
            collapsed ? 'max-w-0 opacity-0' : 'max-w-[11rem] opacity-100'
          )}
          aria-hidden={collapsed}
        >
          {label}
        </span>
      </NavLink>

      {showTooltip && (
        <div
          role="tooltip"
          className={cn(
            'pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-50 -translate-y-1/2',
            'whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-white shadow-lg',
            `opacity-0 scale-95 transition-all duration-200 ${EASE}`,
            'group-hover:opacity-100 group-hover:scale-100'
          )}
        >
          {label}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const { can } = usePermissions()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
    } catch {
      // ignore storage errors
    }
  }, [collapsed])

  function toggleCollapsed() {
    setIsAnimating(true)
    setCollapsed((value) => !value)
  }

  useEffect(() => {
    if (!isAnimating) return undefined

    const timer = window.setTimeout(() => setIsAnimating(false), TRANSITION_MS)
    return () => window.clearTimeout(timer)
  }, [isAnimating, collapsed])

  const items = NAV_ITEMS.filter((item) => {
    if (item.roles && !item.roles.includes(user?.role)) return false
    if (item.module && !can(item.module, 'view')) return false
    return true
  })

  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((part) => part.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?'

  const showTooltips = collapsed && !isAnimating

  return (
    <aside
      className={cn(
        'relative flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-white shadow-sm',
        `transition-[width] duration-300 ${EASE}`,
        collapsed ? 'w-[5.25rem]' : 'w-60'
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center overflow-hidden border-b border-border',
          `transition-[padding] duration-300 ${EASE}`,
          collapsed ? 'justify-between gap-1 px-2' : 'justify-between px-4'
        )}
      >
        <Logo animate collapsed={collapsed} size="md" className="min-w-0 flex-1" />

        <button
          type="button"
          onClick={toggleCollapsed}
          disabled={isAnimating}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-lg',
            `text-muted-foreground transition-all duration-300 ${EASE}`,
            'hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            'disabled:pointer-events-none disabled:opacity-60'
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <nav
        className={cn(
          'sidebar-nav flex-1 space-y-1 overflow-x-hidden p-3',
          `transition-[padding] duration-300 ${EASE}`,
          isAnimating ? 'overflow-y-hidden' : 'overflow-y-auto'
        )}
      >
        {items.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            collapsed={collapsed}
            showTooltip={showTooltips}
          />
        ))}
      </nav>

      <div className="flex h-[4.75rem] shrink-0 items-center border-t border-border px-3">
        <div
          className={cn(
            'group relative flex h-[3.25rem] w-full items-center overflow-hidden rounded-lg bg-muted/40 px-2',
            `transition-[gap] duration-300 ${EASE}`,
            collapsed ? 'justify-center' : 'gap-3'
          )}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-2 ring-white">
            {userInitials}
          </div>

          <div
            className={cn(
              'min-w-0 overflow-hidden leading-tight',
              `transition-[max-width,max-height,opacity,margin] duration-300 ${EASE}`,
              collapsed
                ? 'max-h-0 max-w-0 opacity-0'
                : 'max-h-10 max-w-full flex-1 opacity-100'
            )}
            aria-hidden={collapsed}
          >
            <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.organizationName}</p>
          </div>

          {showTooltips && (
            <div
              role="tooltip"
              className={cn(
                'pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-50 -translate-y-1/2',
                'whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-white shadow-lg',
                `opacity-0 scale-95 transition-all duration-200 ${EASE}`,
                'group-hover:opacity-100 group-hover:scale-100'
              )}
            >
              <p>{user?.name}</p>
              <p className="text-[10px] font-normal text-white/70">{user?.organizationName}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
