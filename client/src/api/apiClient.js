import axios from 'axios';

// Buggy API Client
// Demonstrates:
// 1. Missing AbortSignal: in-flight queries cannot be cancelled when invalidation occurs.
// 2. Vulnerable to Browser HTTP Caching if backend lacks Cache-Control: no-store.
export function createBuggyApiClient(auth, log) {
  const client = axios.create({
    baseURL: '/api'
  });

  return {
    fetchItems: async (context = {}) => {
      const token = auth.user?.access_token;
      log(`[NETWORK] 📤 GET /api/items (Token: ${token ? token.substring(0, 10) + '...' : 'none'})`, 'network');

      try {
        const startTime = Date.now();
        // Notice: signal is NOT passed to axios! Browser request cannot be aborted.
        const res = await client.get('/items', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const duration = Date.now() - startTime;
        const serverTime = res.headers['x-response-time'] || res.data.serverTime;
        const cacheControl = res.headers['cache-control'] || 'none';

        log(`[NETWORK] 📥 GET /api/items responded in ${duration}ms [Cache-Control: ${cacheControl}] (Server Time: ${serverTime?.substring(11, 19)})`, 'network');
        return res.data;
      } catch (err) {
        log(`[NETWORK] ❌ GET /api/items FAILED: ${err.response?.status || err.message}`, 'error');
        throw err;
      }
    },

    updateItem: async (item) => {
      let token = auth.user?.access_token;
      log(`[MUTATION] 📤 PUT /api/items/${item.id} -> Updating name to "${item.name}"`, 'network');

      try {
        const res = await client.put(`/items/${item.id}`, item, {
          headers: { Authorization: `Bearer ${token}` }
        });
        log(`[MUTATION] ✅ PUT /api/items/${item.id} SUCCEEDED on Backend (DB Version: v${res.data.item.version})`, 'success');
        return res.data;
      } catch (err) {
        if (err.response?.status === 401 && auth.user?.refresh_token) {
          log(`[AUTH] ⚠️ Got 401 on PUT. Refreshing token via refresh token...`, 'warning');
          const newUser = await auth.signinSilent();
          token = newUser.access_token;

          const retryRes = await client.put(`/items/${item.id}`, item, {
            headers: { Authorization: `Bearer ${token}` }
          });
          log(`[MUTATION] ✅ PUT succeeded after token refresh! (DB Version: v${retryRes.data.item.version})`, 'success');
          return retryRes.data;
        }
        throw err;
      }
    }
  };
}

// Fixed API Client
// Demonstrates:
// 1. Full AbortSignal propagation: connects TanStack Query's signal to axios so obsolete in-flight refetches are instantly aborted!
// 2. Cache-Busting / Explicit no-store: Ensures browser cache is bypassed or revalidated.
// 3. Centralized token resolution with a refresh lock.
export function createFixedApiClient(auth, log) {
  let refreshPromise = null;

  const getValidToken = async () => {
    if (auth.user && !auth.user.expired && Date.now() < auth.user.expires_at) {
      return auth.user.access_token;
    }

    if (!refreshPromise) {
      log(`[AUTH] 🛡️ Refreshing token before request...`, 'auth');
      refreshPromise = auth.signinSilent().then(
        (newUser) => {
          refreshPromise = null;
          return newUser.access_token;
        },
        (err) => {
          refreshPromise = null;
          throw err;
        }
      );
    }
    return refreshPromise;
  };

  const client = axios.create({
    baseURL: '/api'
  });

  return {
    fetchItems: async ({ signal }) => {
      const token = await getValidToken();
      log(`[NETWORK-FIXED] 📤 GET /api/items with AbortSignal attached (Token: ${token.substring(0, 10)}...)`, 'network');

      const startTime = Date.now();
      // FIX 1: Pass signal to axios so TanStack Query can abort obsolete queries!
      // FIX 2: Add Cache-Control request header to ensure fresh response
      const res = await client.get('/items', {
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache, no-store'
        }
      });
      const duration = Date.now() - startTime;
      log(`[NETWORK-FIXED] 📥 GET /api/items SUCCEEDED in ${duration}ms (DB Version: v${res.data.mutationCount})`, 'success');
      return res.data;
    },

    updateItem: async (item) => {
      const token = await getValidToken();
      log(`[MUTATION-FIXED] 📤 PUT /api/items/${item.id} -> "${item.name}"`, 'network');

      const res = await client.put(`/items/${item.id}`, item, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-store'
        }
      });
      log(`[MUTATION-FIXED] ✅ PUT SUCCEEDED (DB Version: v${res.data.item.version})`, 'success');
      return res.data;
    }
  };
}
