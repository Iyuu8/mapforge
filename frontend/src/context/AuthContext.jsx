import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/authApi';

export const AuthContext = createContext(null);

function readUser(payload) {
  const data = payload?.data || payload?.user || payload || {};
  const roles = data.roles || ['ROLE_GUEST'];

  return {
    id: data.id || null,
    email: data.email || null,
    roles,
    isAuthenticated: Boolean(data.id || data.isAuthenticated),
    isAdmin: roles.includes('ROLE_ADMIN'),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser({ data: { roles: ['ROLE_GUEST'] } }));
  const [booting, setBooting] = useState(true);
  const [authError, setAuthError] = useState(null);

  const refreshUser = useCallback(async () => {
    setBooting(true);
    setAuthError(null);
    try {
      const payload = await authApi.getCurrentUser();
      setUser(readUser(payload));
    } catch (error) {
      setUser(readUser({ data: { roles: ['ROLE_GUEST'], isAuthenticated: false } }));
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const signIn = useCallback(
    async ({ email, password }) => {
      setAuthError(null);
      await authApi.login(email, password);
      await refreshUser();
    },
    [refreshUser]
  );

  const signOut = useCallback(async () => {
    setAuthError(null);
    try {
      await authApi.logout();
    } catch (error) {
      setAuthError(error);
    } finally {
      setUser(readUser({ data: { roles: ['ROLE_GUEST'], isAuthenticated: false } }));
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      booting,
      authError,
      isAuthenticated: user.isAuthenticated,
      isAdmin: user.isAdmin,
      signIn,
      signOut,
      refreshUser,
    }),
    [authError, booting, refreshUser, signIn, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
