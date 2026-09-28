import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { navigate } from '../router';

const AuthContext = createContext(null);

// P04: sessions are per-tab (sessionStorage), and on startup the stored
// session is validated against GET /auth/me so a stale token (deactivated
// account, role change, DB reset) can't masquerade as a logged-in user.
function readStoredUser() {
  try {
    const stored = sessionStorage.getItem('medbridge_user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const validateSession = async () => {
      const token = sessionStorage.getItem('medbridge_token');
      const storedUser = readStoredUser();

      if (!token || !storedUser) {
        sessionStorage.removeItem('medbridge_token');
        sessionStorage.removeItem('medbridge_user');
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        // Server-side truth: reloads the user, rejects deactivated/changed roles.
        const data = await api.me();
        if (!cancelled) setUser(data.user);
      } catch (err) {
        if (!cancelled) {
          if (err && (err.status === 401 || err.status === 403)) {
            // Invalid/expired token or deactivated account → clear this tab's session.
            sessionStorage.removeItem('medbridge_token');
            sessionStorage.removeItem('medbridge_user');
            setUser(null);
          } else {
            // Network/server failure: keep the stored session and let each page's
            // error states handle the outage (do NOT log the user out).
            setUser(storedUser);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    validateSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const applySession = useCallback((data) => {
    sessionStorage.setItem('medbridge_token', data.token);
    sessionStorage.setItem('medbridge_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async (email, password, role) => {
    const data = await api.login(email, password, role);
    return applySession(data);
  }, [applySession]);

  // P05: api client clears storage + redirects on 401/403-invalid-token and fires
  // 'medbridge:auth-failure'; the provider mirrors that into React state.
  useEffect(() => {
    const onAuthFailure = () => setUser(null);
    window.addEventListener('medbridge:auth-failure', onAuthFailure);
    return () => window.removeEventListener('medbridge:auth-failure', onAuthFailure);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('medbridge_token');
    sessionStorage.removeItem('medbridge_user');
    setUser(null);
    navigate('/', { replace: true }); // land on the role picker (P25)
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, applySession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
