import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import AdminEditorPage from './pages/AdminEditorPage';
import OrganizationPickerPage from './pages/OrganizationPickerPage';
import PublicViewerPage from './pages/PublicViewerPage';
import ProtectedRoute from './routing/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/maps"
            element={<OrganizationPickerPage mode="public" />}
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <OrganizationPickerPage mode="admin" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/maps/:organizationId"
            element={<PublicViewerPage />}
          />
          <Route
            path="/admin/maps/:organizationId"
            element={
              <ProtectedRoute requireAdmin>
                <AdminEditorPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
