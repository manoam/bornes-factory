import React, { Component, Suspense, useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ClipboardList,
  Wrench,
  PackageCheck,
  Stethoscope,
  PackageMinus,
  Recycle,
  Search,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { loadRemoteComponent } from '../../remoteLoader'
import { Topbar } from '../Topbar'
import { Sidebar } from '../Sidebar'
import ErrorBoundary from '../ErrorBoundary'

/**
 * App shell, calqué sur konitys-stock.
 *
 * Stratégie: on charge le HeaderBar et Sidebar fédérés depuis la plateforme
 * Konitys via Module Federation. Si la plateforme est indisponible (variable
 * d'env manquante, réseau, etc.), un ErrorBoundary local bascule sur le
 * Topbar/Sidebar locaux qu'on a copiés depuis Stock.
 *
 * Les sections sidebar Factory sont définies ici puis passées aux deux
 * composants (remote et local) avec la même structure.
 */

const RemoteHeaderBar = React.lazy(() => loadRemoteComponent('./HeaderBar'))
const RemoteSidebar = React.lazy(() => loadRemoteComponent('./Sidebar'))

// Sections sidebar Factory.
// Production = ce que l'opérateur fait (créer OF, assembler).
// Parc = ce que la borne devient une fois fabriquée.
//
// Note: deux contrats coexistent — `path` pour le composant remote Konitys
// (calque sur Stock), `to` pour la Sidebar locale (react-router). On porte
// les deux pour éviter un mapping conditionnel.
const SIDEBAR_SECTIONS = [
  {
    label: 'Production',
    items: [
      { icon: LayoutDashboard, label: 'Tableau de bord', path: '/', to: '/' },
      { icon: ClipboardList, label: 'Ordres de fabrication', path: '/production-orders', to: '/production-orders' },
      { icon: Wrench, label: 'Assemblages', path: '/assemblies', to: '/assemblies' },
    ],
  },
  {
    label: 'Atelier',
    items: [
      { icon: Stethoscope, label: 'Réparations', path: '/repair-orders', to: '/repair-orders' },
      { icon: Recycle, label: 'Reconditionnements', path: '/refurbishments', to: '/refurbishments' },
      { icon: PackageMinus, label: 'Démontages', path: '/disassemblies', to: '/disassemblies' },
    ],
  },
  {
    label: 'Parc',
    items: [
      { icon: PackageCheck, label: 'Bornes produites', path: '/produced-bornes', to: '/produced-bornes' },
      { icon: Search, label: 'Recherche borne', path: '/bornes', to: '/bornes' },
    ],
  },
]

// Placeholder dimensionné comme le header final pour éviter le jank.
function HeaderFallback() {
  return (
    <div className="h-12 shrink-0 border-b border-[--k-border] bg-gradient-to-r from-white to-blue-50" />
  )
}

function SidebarFallback() {
  return <div className="w-[210px] shrink-0 bg-[--k-sidebar-bg] h-full" />
}

interface RemoteErrorBoundaryProps {
  fallback: React.ReactNode
  children: React.ReactNode
}

interface RemoteErrorBoundaryState {
  hasError: boolean
}

/**
 * Boundary spécifique au chargement remote: catche les erreurs de fetch /
 * d'init du Module Federation et rend le fallback local. NE PAS confondre
 * avec ErrorBoundary (qui couvre les erreurs des pages).
 */
class RemoteErrorBoundary extends Component<RemoteErrorBoundaryProps, RemoteErrorBoundaryState> {
  constructor(props: RemoteErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): RemoteErrorBoundaryState {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('k_sidebar_collapsed') === '1'
    } catch {
      return false
    }
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem('k_sidebar_collapsed', sidebarCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed])

  // Ferme le menu mobile à chaque navigation.
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Mappe notre user Keycloak vers la shape attendue par le remote HeaderBar.
  const headerUser = user
    ? {
        firstName: user.firstName || user.fullName?.split(' ')[0] || '',
        lastName: user.lastName || user.fullName?.split(' ').slice(1).join(' ') || '',
        email: user.email || '',
        username: user.username || '',
      }
    : null

  const handleNavigate = (path: string) => {
    navigate(path)
  }

  const localTopbar = <Topbar onToggleMobileMenu={() => setMobileMenuOpen((v) => !v)} />
  const localSidebar = (
    <Sidebar
      collapsed={sidebarCollapsed}
      onToggle={() => setSidebarCollapsed((v) => !v)}
      sections={SIDEBAR_SECTIONS}
    />
  )
  const localMobileSidebar = (
    <Sidebar
      collapsed={false}
      onToggle={() => setMobileMenuOpen(false)}
      sections={SIDEBAR_SECTIONS}
    />
  )

  return (
    <div className="h-screen flex flex-col bg-[--k-bg]">
      {/* Header — remote avec fallback local. */}
      <RemoteErrorBoundary fallback={localTopbar}>
        <Suspense fallback={<HeaderFallback />}>
          <RemoteHeaderBar
            user={headerUser}
            onLogout={logout}
            currentAppName="Bornes Factory"
            onNavigate={handleNavigate}
          />
        </Suspense>
      </RemoteErrorBoundary>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar desktop. */}
        <div className="hidden md:block">
          <RemoteErrorBoundary fallback={localSidebar}>
            <Suspense fallback={<SidebarFallback />}>
              <RemoteSidebar
                sections={SIDEBAR_SECTIONS}
                activePath={location.pathname}
                onNavigate={handleNavigate}
                collapsed={sidebarCollapsed}
                onCollapse={() => setSidebarCollapsed((v) => !v)}
                onHelpClick={() => {}}
              />
            </Suspense>
          </RemoteErrorBoundary>
        </div>

        {/* Sidebar mobile (overlay). */}
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/30 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="fixed left-0 top-12 z-40 h-[calc(100vh-48px)] md:hidden">
              <RemoteErrorBoundary fallback={localMobileSidebar}>
                <Suspense fallback={<SidebarFallback />}>
                  <RemoteSidebar
                    sections={SIDEBAR_SECTIONS}
                    activePath={location.pathname}
                    onNavigate={handleNavigate}
                    collapsed={false}
                    onCollapse={() => setMobileMenuOpen(false)}
                    onHelpClick={() => {}}
                  />
                </Suspense>
              </RemoteErrorBoundary>
            </div>
          </>
        )}

        {/* Main */}
        <main className="flex-1 min-w-0 overflow-y-auto p-3 md:p-5">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
