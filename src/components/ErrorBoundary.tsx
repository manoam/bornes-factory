import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import Button from './ui/Button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-[--k-border] bg-[--k-surface] p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="text-lg font-semibold text-[--k-text] mb-1">Erreur d'affichage</h1>
          <p className="text-sm text-[--k-muted] mb-4">
            Une erreur est survenue lors du chargement de cette page. Réessayez ou revenez à l'accueil.
          </p>
          <details className="mb-4 text-left text-xs text-[--k-muted]">
            <summary className="cursor-pointer">Détails techniques</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded bg-[--k-surface-2] p-2 font-mono">
              {this.state.error.message}
            </pre>
          </details>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => this.setState({ error: null })}>
              Réessayer
            </Button>
            <Button onClick={() => { window.location.href = '/' }}>
              Accueil
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
