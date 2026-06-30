import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import ProductionOrders from './pages/ProductionOrders';
import ProductionOrderDetail from './pages/ProductionOrderDetail';
import AssembliesList from './pages/AssembliesList';
import AssemblyDetail from './pages/AssemblyDetail';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
  },
});

function Guard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading) {
    return <div className="p-6 text-[--k-muted]">Connexion en cours…</div>;
  }
  if (!isAuthenticated) {
    return <div className="p-6 text-[--k-muted]">Authentification requise.</div>;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Guard>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="production-orders" element={<ProductionOrders />} />
                <Route path="production-orders/:id" element={<ProductionOrderDetail />} />
                <Route path="assemblies" element={<AssembliesList />} />
                <Route path="assemblies/:id" element={<AssemblyDetail />} />
              </Route>
            </Routes>
          </Guard>
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}
