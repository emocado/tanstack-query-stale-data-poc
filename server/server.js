const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control'],
  exposedHeaders: ['X-Backend-Version', 'X-Response-Time', 'X-Served-From']
}));
app.use(express.json());

// In-memory token store for prototype simulation
const validTokens = new Map();
const validRefreshTokens = new Map();

let mutationCount = 0;

// Server configuration that can be toggled from the UI
let serverConfig = {
  // 'no-store' (fixed) vs 'browser-cache' (buggy: causes browser to cache GET /api/items)
  cacheHeaderMode: 'browser-cache',
  // Delay for GET /api/items in ms (to demonstrate window-focus race condition)
  getDelayMs: 0
};

const initialItems = [
  { id: 1, name: "Product Catalog", category: "Core", priority: "High", updatedAt: new Date().toISOString(), version: 1 },
  { id: 2, name: "Order Processing", category: "Commerce", priority: "Critical", updatedAt: new Date().toISOString(), version: 1 },
  { id: 3, name: "User Auth Service", category: "Security", priority: "High", updatedAt: new Date().toISOString(), version: 1 },
  { id: 4, name: "Payment Gateway", category: "Billing", priority: "Critical", updatedAt: new Date().toISOString(), version: 1 },
  { id: 5, name: "Analytics Dashboard", category: "Reporting", priority: "Medium", updatedAt: new Date().toISOString(), version: 1 }
];

let items = JSON.parse(JSON.stringify(initialItems));

function generateToken(prefix) {
  return `${prefix}_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
}

// Request logger
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'] || 'none';
  const tokenPreview = authHeader.startsWith('Bearer ') ? authHeader.substring(7, 22) + '...' : authHeader;
  console.log(`[${new Date().toISOString().substring(11, 19)}] ➡️  ${req.method} ${req.url} (Auth: ${tokenPreview})`);
  next();
});

const router = express.Router();

// Config endpoints
router.get('/config', (req, res) => {
  res.json(serverConfig);
});

router.post('/config', (req, res) => {
  serverConfig = { ...serverConfig, ...req.body };
  console.log(`[CONFIG] Updated server config:`, serverConfig);
  res.json({ success: true, config: serverConfig });
});

// 1. Auth Endpoint: Login
router.post('/auth/login', (req, res) => {
  const ttlSeconds = parseInt(req.body.ttlSeconds) || 900; // default 15 minutes
  const accessToken = generateToken('acc');
  const refreshToken = generateToken('ref');
  const now = Date.now();
  const expiresAt = now + (ttlSeconds * 1000);

  validTokens.set(accessToken, { userId: 'usr_1', expiresAt, type: 'access' });
  validRefreshTokens.set(refreshToken, { userId: 'usr_1', expiresAt: now + (12 * 3600 * 1000) });

  console.log(`[AUTH] Issued access token: ${accessToken.substring(0, 15)}... (expires in ${ttlSeconds}s)`);

  res.json({
    accessToken,
    refreshToken,
    expiresIn: ttlSeconds,
    expiresAt,
    user: {
      id: 'usr_1',
      name: 'Jane Doe',
      email: 'jane.doe@example.com'
    }
  });
});

// 2. Auth Endpoint: Refresh Token
router.post('/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken || !validRefreshTokens.has(refreshToken)) {
    console.log(`[AUTH] ❌ Invalid refresh token: ${refreshToken}`);
    return res.status(401).json({ error: 'invalid_refresh_token', message: 'Refresh token is invalid or expired' });
  }

  const session = validRefreshTokens.get(refreshToken);
  if (Date.now() > session.expiresAt) {
    validRefreshTokens.delete(refreshToken);
    console.log(`[AUTH] ❌ Expired refresh token`);
    return res.status(401).json({ error: 'refresh_token_expired', message: 'Refresh token has expired' });
  }

  const ttlSeconds = parseInt(req.body.ttlSeconds) || 900;
  const newAccessToken = generateToken('acc');
  const now = Date.now();
  const expiresAt = now + (ttlSeconds * 1000);

  validTokens.set(newAccessToken, { userId: session.userId, expiresAt, type: 'access' });
  console.log(`[AUTH] 🔄 Refreshed access token: ${newAccessToken.substring(0, 15)}...`);

  res.json({
    accessToken: newAccessToken,
    refreshToken: refreshToken,
    expiresIn: ttlSeconds,
    expiresAt
  });
});

// Auth Middleware
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing Authorization header' });
  }

  const token = authHeader.substring(7);
  const tokenData = validTokens.get(token);

  if (!tokenData) {
    return res.status(401).json({ error: 'invalid_token', message: 'Token not found' });
  }

  if (Date.now() > tokenData.expiresAt) {
    console.log(`[AUTH] ⚠️ Expired token used: ${token.substring(0, 15)}...`);
    return res.status(401).json({ error: 'token_expired', message: 'Access token expired' });
  }

  req.user = tokenData;
  next();
}

// 3. GET /api/items (The Table Query)
router.get('/items', verifyToken, (req, res) => {
  const handleResponse = () => {
    const responseTime = new Date().toISOString();
    res.setHeader('X-Backend-Version', String(mutationCount));
    res.setHeader('X-Response-Time', responseTime);
    res.setHeader('X-Served-From', 'SERVER-NETWORK');

    // =========================================================================
    // HTTP CACHING DEMONSTRATION:
    // When cacheHeaderMode is 'browser-cache', the server sends Cache-Control: max-age.
    // In browsers, when you switch tabs, TanStack Query refetches on window focus.
    // If max-age is present, the browser satisfies the request from DISK/MEMORY CACHE!
    // The network tab shows 200 OK (from disk cache), but the response body is STALE!
    //
    // When cacheHeaderMode is 'no-store' (the FIX), the browser NEVER caches,
    // guaranteeing that every window-focus refetch hits the server for fresh data.
    // =========================================================================
    if (serverConfig.cacheHeaderMode === 'browser-cache') {
      // Allow browser to cache for 120 seconds
      res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=60');
      console.log(`[HTTP-CACHE] ⚠️ Sent Cache-Control: public, max-age=120 (Browser will cache this response!)`);
    } else {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      console.log(`[HTTP-CACHE] 🛡️ Sent Cache-Control: no-store (Browser caching disabled)`);
    }

    console.log(`[DB] 📋 GET /api/items -> Returning ${items.length} items (Global Mutation Count: ${mutationCount})`);
    res.json({
      items: items,
      mutationCount,
      serverTime: responseTime,
      cacheHeaderMode: serverConfig.cacheHeaderMode
    });
  };

  if (serverConfig.getDelayMs > 0) {
    console.log(`[DELAY] ⏱️ Simulating server latency of ${serverConfig.getDelayMs}ms for GET /api/items...`);
    setTimeout(handleResponse, serverConfig.getDelayMs);
  } else {
    handleResponse();
  }
});

// 4. PUT /api/items/:id (The Table Row Update Mutation)
router.put('/items/:id', verifyToken, (req, res) => {
  const id = parseInt(req.params.id);
  const itemIndex = items.findIndex(i => i.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'not_found', message: 'Item not found' });
  }

  const { name, priority, category } = req.body;
  mutationCount++;

  items[itemIndex] = {
    ...items[itemIndex],
    name: name !== undefined ? name : items[itemIndex].name,
    priority: priority !== undefined ? priority : items[itemIndex].priority,
    category: category !== undefined ? category : items[itemIndex].category,
    version: items[itemIndex].version + 1,
    updatedAt: new Date().toISOString()
  };

  console.log(`[DB] ✅ UPDATED item ${id} -> "${items[itemIndex].name}" (v${items[itemIndex].version}). Total Mutations: ${mutationCount}`);

  // Note: Unsafe HTTP methods (PUT/POST/DELETE) according to RFC 7234 invalidate
  // the cache for /api/items/:id, BUT DO NOT invalidate /api/items (the list collection)!
  // This is why browsers continue serving /api/items from disk cache after a PUT to /api/items/:id!

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    success: true,
    item: items[itemIndex],
    mutationCount,
    serverTime: new Date().toISOString()
  });
});

// 5. Reset Endpoint
router.post('/reset', (req, res) => {
  items = JSON.parse(JSON.stringify(initialItems));
  mutationCount = 0;
  console.log(`[DB] 🔄 Database reset to initial state`);
  res.json({ success: true, message: 'Reset successful' });
});

app.use('/api', router);
app.use(router);

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 Prototype API Server running on port ${PORT}`);
    console.log(`   Config: cacheHeaderMode=${serverConfig.cacheHeaderMode}, getDelayMs=${serverConfig.getDelayMs}`);
    console.log(`=================================================`);
  });
}
