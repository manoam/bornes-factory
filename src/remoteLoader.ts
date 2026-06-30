import * as React from 'react';
import * as ReactDOM from 'react-dom';

/**
 * Loader for Module Federation remotes. Same pattern as konitys-stock.
 *
 * The platform host (configured via VITE_PLATEFORM_URL) exposes a
 * `remoteEntry.js` that surfaces shared HeaderBar / Sidebar components.
 * We register host React / ReactDOM into the shared scope so remotes
 * reuse our single instance (otherwise we get hook violations).
 *
 * If VITE_PLATEFORM_URL is unset or unreachable, `loadRemoteComponent`
 * throws — AppLayout's RemoteErrorBoundary catches that and falls back
 * to the local Topbar / Sidebar.
 */

// L'ancien fallback Railway est périmé (404). On pointe par défaut sur
// l'instance dev Konitys. En prod, VITE_PLATEFORM_URL doit être configurée
// en Build Argument côté Coolify pour pointer sur plateform.orkessi.com.
const PLATEFORM_URL =
  import.meta.env.VITE_PLATEFORM_URL || 'https://plateformdev.orkessi.com';

interface RemoteContainer {
  init: (shareScope: Record<string, unknown>) => void;
  get: (module: string) => Promise<() => any>;
}

function ensureSharedScope() {
  const g = globalThis as any;
  g.__federation_shared__ = g.__federation_shared__ || {};
  g.__federation_shared__['default'] = g.__federation_shared__['default'] || {};

  const shared = g.__federation_shared__['default'];

  if (!shared['react']) {
    shared['react'] = {
      '18.3.1': {
        get: () => () => React,
        scope: 'default',
      },
    };
  }

  if (!shared['react-dom']) {
    shared['react-dom'] = {
      '18.3.1': {
        get: () => () => ReactDOM,
        scope: 'default',
      },
    };
  }
}

let containerPromise: Promise<RemoteContainer> | null = null;

function loadRemoteEntry(): Promise<RemoteContainer> {
  if (containerPromise) return containerPromise;

  ensureSharedScope();

  containerPromise = import(/* @vite-ignore */ `${PLATEFORM_URL}/assets/remoteEntry.js`)
    .then((container: RemoteContainer) => {
      container.init({});
      return container;
    })
    .catch((err) => {
      containerPromise = null;
      throw err;
    });

  return containerPromise;
}

export async function loadRemoteComponent(
  moduleName: string,
): Promise<{ default: React.ComponentType<any> }> {
  const container = await loadRemoteEntry();
  const factory = await container.get(moduleName);
  const result = factory();

  if (result && typeof result === 'object' && 'default' in result) {
    return result;
  }
  return { default: result };
}
