import { useState, useRef, useEffect } from 'react'
import {
  Bell, HelpCircle, Search, User, LogOut, Settings,
  ChevronDown, X, Menu, Plus,
  ListTodo, Factory, ClipboardList,
} from 'lucide-react'
import { cn } from './ui/cn'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

/**
 * Local fallback Topbar for Factory. Same visual language as Stock's so
 * the federated host can swap to its remote version without users
 * noticing. App identity is hardcoded to "Bornes Factory" instead of
 * "Stock Manager" — that's the main difference.
 */

interface TopbarProps {
  onToggleMobileMenu?: () => void
}

export function Topbar({ onToggleMobileMenu }: TopbarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [notifOpen, setNotifOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus()
  }, [searchOpen])

  // Initiales pour l'avatar fallback. fullName est déjà calculé proprement
  // par computeDisplayName (cf. AuthContext), donc on s'en sert directement
  // — sauf si vraiment rien n'est dispo, auquel cas on tombe sur '??'.
  const initials = user?.fullName
    ? user.fullName
        .split(/\s+/)
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '??'

  return (
    <header className="shrink-0 z-30 border-b border-[--k-border] bg-gradient-to-r from-white to-blue-50 shadow-sm shadow-black/[0.04]">
      <div className="flex h-12 items-center gap-2 px-3 md:gap-3 md:px-4">
        {/* Mobile hamburger */}
        {onToggleMobileMenu && (
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[--k-muted] hover:bg-[--k-surface-2] md:hidden"
            onClick={onToggleMobileMenu}
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>
        )}

        {/* App identity */}
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
            <Factory className="h-4 w-4 text-indigo-600" />
          </span>
          <div className="hidden sm:flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[--k-muted] leading-none">
              KONITYS
            </span>
            <span className="text-[13px] font-semibold text-[--k-text] leading-tight">
              Bornes Factory
            </span>
          </div>
        </div>

        <div className="flex-1" />

        {/* Search */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[--k-muted] hover:bg-[--k-surface-2] hover:text-[--k-text] transition"
          onClick={() => {
            setSearchOpen(true)
            setNotifOpen(false)
            setAccountOpen(false)
          }}
        >
          <Search className="h-[18px] w-[18px]" />
        </button>

        {searchOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
              onClick={() => {
                setSearchOpen(false)
                setSearchQ('')
              }}
            />
            <div className="fixed left-3 right-3 top-[60px] z-50 mx-auto max-w-[480px] rounded-2xl border border-[--k-border] bg-white/95 backdrop-blur-lg shadow-2xl shadow-black/10">
              <div className="flex items-center gap-2.5 border-b border-[--k-border] px-4 py-3">
                <Search className="h-4 w-4 text-[--k-muted] shrink-0" />
                <input
                  ref={searchRef}
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Rechercher partout..."
                  className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[--k-muted]/50"
                />
                <button
                  onClick={() => {
                    setSearchOpen(false)
                    setSearchQ('')
                  }}
                  className="text-[--k-muted] hover:text-[--k-text]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-4 py-6 text-center text-[13px] text-[--k-muted]">
                {searchQ.trim()
                  ? `Aucun résultat pour "${searchQ}"`
                  : 'Tapez pour rechercher...'}
              </div>
              <div className="border-t border-[--k-border] px-4 py-2 text-[11px] text-[--k-muted]">
                <kbd className="rounded bg-[--k-surface-2] px-1.5 py-0.5 text-[10px] font-medium">
                  Esc
                </kbd>{' '}
                pour fermer
              </div>
            </div>
          </>
        )}

        {/* Quick add — Factory-specific shortcuts */}
        <div className="relative">
          <button
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[--k-primary] px-2.5 text-white hover:brightness-110 transition shadow-sm shadow-[--k-primary]/20"
            onClick={() => {
              setAddOpen((v) => !v)
              setNotifOpen(false)
              setAccountOpen(false)
            }}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline text-[12px] font-medium">Créer</span>
          </button>
          {addOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setAddOpen(false)} />
              <div className="absolute right-0 z-40 mt-2 w-[260px] rounded-2xl border border-[--k-border] bg-white shadow-xl shadow-black/8 py-1">
                <div className="px-3 py-2 border-b border-[--k-border]">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[--k-muted]">
                    Création rapide
                  </span>
                </div>
                <div className="py-1">
                  <QuickAddItem
                    icon={ClipboardList}
                    label="Nouvel ordre de fabrication"
                    onClick={() => {
                      setAddOpen(false)
                      navigate('/production-orders')
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Tasks — placeholder */}
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[--k-muted] hover:bg-[--k-surface-2] hover:text-[--k-text] transition"
          title="Mes tâches"
        >
          <ListTodo className="h-[18px] w-[18px]" />
        </button>

        {/* Notifications — placeholder */}
        <div className="relative">
          <button
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[--k-muted] hover:bg-[--k-surface-2] hover:text-[--k-text] transition"
            onClick={() => {
              setNotifOpen((v) => !v)
              setAccountOpen(false)
              setAddOpen(false)
            }}
          >
            <Bell className="h-[18px] w-[18px]" />
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 z-40 mt-2 w-[calc(100vw-24px)] sm:w-[340px] max-w-[340px] rounded-2xl border border-[--k-border] bg-white/95 backdrop-blur-lg shadow-xl shadow-black/8">
                <div className="flex items-center justify-between border-b border-[--k-border] px-4 py-3">
                  <span className="text-[14px] font-semibold">Notifications</span>
                  <button className="text-xs text-[--k-primary] hover:underline">
                    Tout marquer lu
                  </button>
                </div>
                <div className="px-4 py-6 text-center text-[13px] text-[--k-muted]">
                  Aucune notification
                </div>
              </div>
            </>
          )}
        </div>

        <button className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg text-[--k-muted] hover:bg-[--k-surface-2] hover:text-[--k-text] transition">
          <HelpCircle className="h-[18px] w-[18px]" />
        </button>

        <div className="hidden sm:block mx-0.5 h-6 w-px bg-[--k-border]" />

        {/* Account */}
        <div className="relative">
          <button
            className="flex h-9 items-center gap-2 rounded-lg px-2 hover:bg-[--k-surface-2] transition"
            onClick={() => {
              setAccountOpen((v) => !v)
              setNotifOpen(false)
            }}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-[11px] font-semibold text-white">
              {initials}
            </span>
            <span className="hidden sm:inline text-[13px] font-medium text-[--k-text]">
              {user?.firstName || user?.fullName || ''}
            </span>
            <ChevronDown className="h-3 w-3 text-[--k-muted]" />
          </button>
          {accountOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setAccountOpen(false)} />
              <div className="absolute right-0 z-40 mt-2 w-[240px] rounded-2xl border border-[--k-border] bg-white/95 backdrop-blur-lg shadow-xl shadow-black/8 py-1">
                <div className="px-3 py-2.5 border-b border-[--k-border]">
                  <div className="text-[13px] font-semibold text-[--k-text]">
                    {user?.fullName || 'Utilisateur'}
                  </div>
                  <div className="text-xs text-[--k-muted]">{user?.email}</div>
                </div>
                <div className="py-1">
                  <AccountItem icon={User} label="Mon compte" />
                  <AccountItem icon={Settings} label="Paramètres" />
                </div>
                <div className="border-t border-[--k-border] py-1">
                  <AccountItem icon={LogOut} label="Déconnexion" danger onClick={logout} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function QuickAddItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Factory
  label: string
  onClick?: () => void
}) {
  return (
    <button
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[--k-surface-2] transition"
      onClick={onClick}
    >
      <Icon className="h-4 w-4 text-[--k-primary] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-[--k-text]">{label}</div>
      </div>
    </button>
  )
}

function AccountItem({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: typeof User
  label: string
  danger?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition hover:bg-[--k-surface-2]',
        danger ? 'text-[--k-danger]' : 'text-[--k-text]'
      )}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}
