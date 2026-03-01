'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, User, RegisterData, LoginData } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  /** Returns the pending email so the caller can redirect to /verify-email */
  register: (data: RegisterData) => Promise<{ email: string }>;
  login: (data: LoginData) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetches the current user profile from the server and updates the context. */
  refreshUser: () => Promise<void>;
  /** Called after OTP verification succeeds — stores token and user */
  completeAuth: (token: string, user: User) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load token from localStorage on mount
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      setToken(storedToken);
      // Fetch user profile
      api
        .getProfile(storedToken)
        .then((user) => {
          setUser(user);
        })
        .catch(() => {
          // Token is invalid, clear it
          localStorage.removeItem('auth_token');
          setToken(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const register = async (data: RegisterData): Promise<{ email: string }> => {
    // Registration now returns { message, email } — no token yet.
    // The caller should redirect to /verify-email?email=...
    const response = await api.register(data);
    return { email: response.email };
  };

  const completeAuth = (token: string, user: User) => {
    setUser(user);
    setToken(token);
    localStorage.setItem('auth_token', token);
  };

  const login = async (data: LoginData) => {
    try {
      const response = await api.login(data);
      setUser(response.user);
      setToken(response.token);
      localStorage.setItem('auth_token', response.token);
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await api.logout(token);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setToken(null);
      localStorage.removeItem('auth_token');
    }
  };

  /** Re-fetch the current user from the server and update context state. */
  const refreshUser = async () => {
    const t = token || localStorage.getItem('auth_token');
    if (!t) return;
    try {
      const updated = await api.getProfile(t);
      setUser(updated);
    } catch (e) {
      console.error('refreshUser failed:', e);
    }
  };

  const value = {
    user,
    token,
    loading,
    register,
    login,
    logout,
    refreshUser,
    completeAuth,
    isAuthenticated: !!user && !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
