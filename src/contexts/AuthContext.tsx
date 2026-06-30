import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import keycloak from '../config/keycloak';

interface User {
  id: string;
  email?: string;
  username: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
}

/**
 * Calcule un nom affichable depuis les claims du token Keycloak.
 *
 * Ordre de préférence — synchro avec le backend `computeDisplayName` dans
 * `middleware/auth.ts`. Cherche d'abord le claim `name`, sinon compose
 * `given_name + family_name`, sinon préfixe email, et en dernier recours
 * `preferred_username` SAUF s'il a le format laid des IdP fédérés
 * `f:{realm-id}:{user-id}`.
 */
function computeDisplayName(parsed: Record<string, unknown>): string {
  const name = parsed.name;
  if (typeof name === 'string' && name.trim()) return name.trim();

  const composed = [parsed.given_name, parsed.family_name]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ')
    .trim();
  if (composed) return composed;

  const email = parsed.email;
  if (typeof email === 'string' && email.includes('@')) {
    return email.split('@')[0];
  }

  const username = typeof parsed.preferred_username === 'string' ? parsed.preferred_username : '';
  if (username && !/^f:[\w-]+:\d+$/.test(username)) return username;

  return 'Utilisateur';
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
  logout: () => void;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    keycloak
      .init({ onLoad: 'login-required', checkLoginIframe: false })
      .then((authenticated) => {
        if (authenticated && keycloak.tokenParsed) {
          const parsed = keycloak.tokenParsed as Record<string, unknown>;
          const realm = (parsed.realm_access as { roles?: string[] } | undefined)?.roles || [];
          const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID;
          const client =
            (parsed.resource_access as Record<string, { roles?: string[] }> | undefined)?.[clientId]
              ?.roles || [];

          setUser({
            id: String(parsed.sub),
            email: parsed.email as string,
            username: (parsed.preferred_username as string) || String(parsed.sub),
            fullName: computeDisplayName(parsed),
            firstName: parsed.given_name as string,
            lastName: parsed.family_name as string,
            roles: Array.from(new Set([...realm, ...client])),
          });
          setToken(keycloak.token || null);
          setIsAuthenticated(true);

          // Refresh the token every 60s. updateToken(30) refreshes when there
          // are <30s left, otherwise it's a no-op.
          const interval = setInterval(() => {
            keycloak.updateToken(30).then((refreshed) => {
              if (refreshed) setToken(keycloak.token || null);
            });
          }, 60_000);
          return () => clearInterval(interval);
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[Auth] Keycloak init failed:', err);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const logout = () => keycloak.logout();
  const hasRole = (role: string) => !!user?.roles.includes(role);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, token, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
