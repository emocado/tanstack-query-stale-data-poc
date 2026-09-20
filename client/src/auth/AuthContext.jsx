import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export function AuthProvider({ children, onLog }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const userRef = useRef(null);
  userRef.current = user;

  const log = useCallback((msg, type = 'info') => {
    if (onLog) onLog(msg, type);
  }, [onLog]);

  // Initial Login simulation
  const login = useCallback(async (ttlSeconds = 12) => {
    try {
      setIsLoading(true);
      log(`[AUTH] 🔑 Logging in (Requesting ${ttlSeconds}s Access Token)...`, 'auth');
      const res = await axios.post('/api/auth/login', { ttlSeconds });
      const userData = {
        profile: res.data.user,
        access_token: res.data.accessToken,
        refresh_token: res.data.refreshToken,
        expires_at: res.data.expiresAt,
        expired: false,
        expires_in: res.data.expiresIn
      };
      setUser(userData);
      setIsLoading(false);
      log(`[AUTH] ✅ Logged in. Token: ${userData.access_token.substring(0, 14)}... (expires in ${ttlSeconds}s)`, 'success');
      return userData;
    } catch (err) {
      log(`[AUTH] ❌ Login failed: ${err.message}`, 'error');
      setIsLoading(false);
    }
  }, [log]);

  // Silent Renew / Refresh Token simulation (identical to oidc-client-ts signinSilent)
  const signinSilent = useCallback(async (ttlSeconds = 12) => {
    const currentUser = userRef.current;
    if (!currentUser?.refresh_token) {
      log(`[AUTH] ❌ Cannot refresh: No refresh token present!`, 'error');
      throw new Error('No refresh token');
    }

    try {
      log(`[AUTH] 🔄 Calling /api/auth/refresh with refresh token...`, 'auth');
      const res = await axios.post('/api/auth/refresh', {
        refreshToken: currentUser.refresh_token,
        ttlSeconds
      });

      const updatedUser = {
        ...currentUser,
        access_token: res.data.accessToken,
        refresh_token: res.data.refreshToken || currentUser.refresh_token,
        expires_at: res.data.expiresAt,
        expired: false,
        expires_in: res.data.expiresIn
      };

      setUser(updatedUser);
      log(`[AUTH] ✅ Token refreshed successfully! New token: ${updatedUser.access_token.substring(0, 14)}...`, 'success');
      return updatedUser;
    } catch (err) {
      log(`[AUTH] ❌ Silent renew failed: ${err.message}`, 'error');
      throw err;
    }
  }, [log]);

  // Simulate 15-minute idle: Immediately expires access token
  const simulateIdle = useCallback(() => {
    if (!userRef.current) return;
    log(`[AUTH] ⏳ SIMULATING 15-MIN IDLE TIME: Access token has now EXPIRED!`, 'warning');
    setUser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        expires_at: Date.now() - 5000,
        expired: true
      };
    });
    setTimeLeft(0);
  }, [log]);

  // Countdown timer
  useEffect(() => {
    if (!user?.expires_at) return;

    const interval = setInterval(() => {
      const remainingMs = user.expires_at - Date.now();
      const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimeLeft(seconds);

      // When countdown reaches 0 and not marked expired yet
      if (seconds === 0 && !user.expired) {
        log(`[AUTH] ⏱️ Access Token reached expiration (Idle). Token is now EXPIRED.`, 'warning');
        setUser(prev => prev ? ({ ...prev, expired: true }) : null);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [user?.expires_at, user?.expired, log]);

  // Initial auto-login on mount
  useEffect(() => {
    login(12);
  }, [login]);

  // In react-oidc-context:
  // isAuthenticated: action.user ? !action.user.expired : false
  const isAuthenticated = Boolean(user && !user.expired);

  // In our fixed pattern:
  // hasSession: Boolean(user && user.refresh_token)
  // Even if access_token is temporarily expired, the session is active because refresh token is valid!
  const hasSession = Boolean(user && user.refresh_token);

  const value = {
    user,
    isAuthenticated,
    hasSession,
    isLoading,
    timeLeft,
    login,
    signinSilent,
    simulateIdle
  };

  return (
    <AuthContext.Provider value={value}>
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
