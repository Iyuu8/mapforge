import { Navigate, useLocation } from 'react-router-dom';
import StatusMessage from '../components/common/StatusMessage';
import useAuth from '../hooks/useAuth';

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { booting, isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <main className="centeredPage">
        <StatusMessage title="Checking session">Loading your MapForge access.</StatusMessage>
      </main>
    );
  }

  if (!isAuthenticated || (requireAdmin && !isAdmin)) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
