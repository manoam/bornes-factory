import { NavLink, useLocation } from 'react-router-dom'
import { cn } from './ui/cn'
import {
  LayoutDashboard, ClipboardList, Wrench, PackageCheck,
  ChevronsLeft, ChevronsRight, HelpCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Local fallback Sidebar for Factory. Mirrors the structure used by the
 * remote federated Sidebar from the platform host so they share the same
 * prop contract. When the remote loads, AppLayout swaps to it; otherwise
 * we render this one with the exact same sections.
 */

interface SidebarItem {
  label: string
  icon: LucideIcon
  to: string
}

interface SidebarSection {
  label: string
  items: SidebarItem[]
}

const DEFAULT_SECTIONS: SidebarSection[] = [
  {
    label: 'Production',
    items: [
      { label: 'Tableau de bord', icon: LayoutDashboard, to: '/' },
      { label: 'Ordres de fabrication', icon: ClipboardList, to: '/production-orders' },
      { label: 'Assemblages', icon: Wrench, to: '/assemblies' },
    ],
  },
  {
    label: 'Parc',
    items: [
      { label: 'Bornes produites', icon: PackageCheck, to: '/produced-bornes' },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  sections?: SidebarSection[]
}

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group/tip relative">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 opacity-0 transition-opacity group-hover/tip:opacity-100">
        <div className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] font-medium text-white shadow-lg">
          {label}
        </div>
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-slate-900" />
      </div>
    </div>
  )
}

export function Sidebar({ collapsed, onToggle, sections = DEFAULT_SECTIONS }: SidebarProps) {
  const location = useLocation()

  function SidebarNavItem({ item }: { item: SidebarItem }) {
    const Icon = item.icon
    const isActive =
      item.to === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(item.to)

    const link = (
      <NavLink
        to={item.to}
        className={cn(
          'relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-all duration-150',
          collapsed ? 'justify-center px-0' : 'justify-start',
          isActive
            ? 'bg-white/10 text-white'
            : 'text-[--k-sidebar-text] hover:bg-white/[0.06] hover:text-[--k-sidebar-text-active]'
        )}
      >
        {isActive && !collapsed && (
          <span className="absolute left-0 top-[6px] bottom-[6px] w-[2px] rounded-full bg-white" />
        )}
        <Icon
          className={cn('h-[16px] w-[16px] shrink-0', isActive ? 'text-white' : '')}
        />
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    )

    if (collapsed) {
      return <Tooltip label={item.label}>{link}</Tooltip>
    }
    return link
  }

  function BottomLink({
    icon: Icon,
    label,
    onClick,
  }: {
    icon: LucideIcon
    label: string
    onClick?: () => void
  }) {
    const inner = (
      <span
        className={cn(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium text-[--k-sidebar-text] hover:bg-white/[0.06] hover:text-[--k-sidebar-text-active] transition',
          collapsed && 'justify-center px-0',
          onClick && 'w-full'
        )}
      >
        <Icon className="h-[16px] w-[16px] shrink-0" />
        {!collapsed && <span>{label}</span>}
      </span>
    )

    const element = (
      <button onClick={onClick} className="w-full">
        {inner}
      </button>
    )

    if (collapsed) {
      return <Tooltip label={label}>{element}</Tooltip>
    }
    return element
  }

  return (
    <aside
      className={cn(
        'sticky top-12 h-[calc(100vh-48px)] shrink-0 bg-[--k-sidebar-bg] transition-all duration-200',
        collapsed ? 'w-[52px]' : 'w-[210px]'
      )}
    >
      <div className="flex h-full flex-col justify-between">
        <div className="flex-1 overflow-y-auto pt-3 pb-2">
          {sections.map((section, si) => (
            <div key={section.label} className={cn(si > 0 && 'mt-4')}>
              {!collapsed && (
                <div className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-[--k-sidebar-section]">
                  {section.label}
                </div>
              )}
              {collapsed && si > 0 && (
                <div className="mx-3 mb-2 border-t border-[--k-sidebar-border]" />
              )}
              <nav className="space-y-0.5 px-2">
                {section.items.map((item) => (
                  <SidebarNavItem key={item.to} item={item} />
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="border-t border-[--k-sidebar-border] px-2 py-2 space-y-0.5">
          <BottomLink icon={HelpCircle} label="Aide" />
          <BottomLink
            icon={collapsed ? ChevronsRight : ChevronsLeft}
            label={collapsed ? 'Déplier' : 'Réduire'}
            onClick={onToggle}
          />
        </div>
      </div>
    </aside>
  )
}
