import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import ProductionOrders from './pages/ProductionOrders';
import ProductionOrderDetail from './pages/ProductionOrderDetail';
import AssembliesList from './pages/AssembliesList';
import AssemblyDetail from './pages/AssemblyDetail';
import ProducedBornes from './pages/ProducedBornes';
import ProducedBorneDetail from './pages/ProducedBorneDetail';
import RepairOrdersList from './pages/RepairOrdersList';
import RepairOrderDetail from './pages/RepairOrderDetail';
import DisassembliesList from './pages/DisassembliesList';
import DisassemblyDetail from './pages/DisassemblyDetail';
import RefurbishmentsList from './pages/RefurbishmentsList';
import RefurbishmentDetail from './pages/RefurbishmentDetail';
import ComponentTimeline from './pages/ComponentTimeline';
import BorneTimeline, { BorneSearch } from './pages/BorneTimeline';

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
                <Route path="produced-bornes" element={<ProducedBornes />} />
                <Route path="produced-bornes/:id" element={<ProducedBorneDetail />} />
                <Route path="repair-orders" element={<RepairOrdersList />} />
                <Route path="repair-orders/:id" element={<RepairOrderDetail />} />
                <Route path="disassemblies" element={<DisassembliesList />} />
                <Route path="disassemblies/:id" element={<DisassemblyDetail />} />
                <Route path="refurbishments" element={<RefurbishmentsList />} />
                <Route path="refurbishments/:id" element={<RefurbishmentDetail />} />
                <Route path="components/:sn" element={<ComponentTimeline />} />
                <Route path="bornes" element={<BorneSearch />} />
                <Route path="bornes/:internal" element={<BorneTimeline />} />
                <Route path="assemblies/:id" element={<AssemblyDetail />} />
              </Route>
            </Routes>
          </Guard>
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}
