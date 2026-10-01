import { Navigate, useLocation } from 'react-router-dom';
import StatusMessage from '../components/common/StatusMessage';
import useAuth from '../hooks/useAuth';

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requireSuperAdmin = false,
}) {
  const { booting, isAuthenticated, isAdmin, isSuperAdmin } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <main className="centeredPage">
        <StatusMessage title="Checking session">Loading your MapForge access.</StatusMessage>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/maps" replace />;
  }

  return children;
}
