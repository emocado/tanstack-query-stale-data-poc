# TanStack Query + Tab Switch / Window Focus Stale Data Lab

This repository recreates, demonstrates, and resolves the issue where **switching tabs triggers TanStack Query to refetch data (`refetchOnWindowFocus`), the Network Tab shows the fetch request executing, but the response payload returns stale and old data** without your updated changes, even though your database has already been updated.

---

## 🔍 The Root Causes: Why Did the Network Tab Return Old Data?

When you update a row in your table and then switch tabs (or leave the tab idle and return), TanStack Query triggers a background refetch via `refetchOnWindowFocus: true`.

When inspecting Chrome DevTools Network tab, you see the `GET` request, but the response body contains the **old stale data**. There are two primary technical causes:

---

### Root Cause 1: Browser HTTP Cache (RFC 7234 Collection Invalidation Miss)

#### The Mechanism:
1. When your app initially fetches the table data via `GET /api/items`, your backend server returns the list of items.
2. If your backend server lacks an explicit `Cache-Control: no-store` header (which is the default in Express, Spring, NestJS, and ASP.NET unless manually configured), the browser (Chrome, Edge, Firefox) **stores the response in its HTTP Disk/Memory Cache** (often using heuristic caching or `max-age`).
3. You update a row in the table by sending `PUT /api/items/1`.
4. Your backend updates the database.
5. **The HTTP Caching Catch (RFC 7234 Section 4.4)**:
   > *"A cache MUST invalidate the effective Request URI of an unsafe request... A cache is NOT required to invalidate other URIs."*
   - Modifying item #1 via `PUT /api/items/1` invalidates the cached entry for `/api/items/1`.
   - **It DOES NOT invalidate `/api/items` (the collection endpoint)!**
6. You switch tabs to another browser tab and switch back:
   - TanStack Query's `refetchOnWindowFocus` triggers `fetch('/api/items')`.
   - The browser looks at its HTTP cache and sees that `/api/items` is still within its cache lifetime.
   - **The browser satisfies the request directly from disk/memory cache!**
   - In the Network tab, you see `GET /api/items` with Status `200 OK` (or `200 (from disk cache)`).
   - When you inspect the Response tab, you see the **OLD STALE DATA** from when the page was first loaded! The request never even reached your backend database!
7. **Why F5 (Browser Reload) fixes it**:
   - When you press **F5**, the browser automatically sends `Cache-Control: max-age=0` (or `no-cache`), forcing Chrome to bypass the disk cache and fetch the fresh data from the server.

---

### Root Cause 2: The Window-Focus In-Flight Race Condition (Missing `AbortSignal`)

#### The Mechanism:
1. You switch back to the application tab. The browser window immediately fires the `focus` event.
2. TanStack Query detects the focus event and immediately fires a background refetch: `GET /api/items` (Request #1).
   - At this precise moment, Request #1 queries the backend database **before** your mutation has occurred. The server reads the old data.
3. Almost simultaneously, you click "Save" on a row: `PUT /api/items/1` (Request #2).
4. The mutation request (Request #2) completes quickly (e.g. in 100ms) and updates the database.
5. In `onSuccess`, you call `queryClient.invalidateQueries({ queryKey: ['items'] })`.
6. **The Race Condition**:
   - If your `queryFn` was written without connecting TanStack Query's `AbortSignal`:
     ```typescript
     // ⚠️ BUGGY: signal is not passed to fetch or axios!
     queryFn: () => axios.get('/api/items')
     ```
   - TanStack Query cannot abort Request #1!
   - Request #1 finishes at t = 300ms, returning the **old database snapshot**.
   - TanStack Query receives the response of Request #1 and **overwrites the cache with the old stale data**!
   - In the Network tab, you see a `GET /api/items` that finished around or after your update, and its response has the old data!

---

## 🛠️ The Fixes to Apply in Your Application

### Fix 1: Add `Cache-Control: no-store` on Backend Dynamic GET Endpoints
Ensure your API server prevents browsers from caching dynamic API collection endpoints:

**In Node.js / Express:**
```javascript
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
```

**In Spring Boot / Java:**
```java
@GetMapping("/api/items")
public ResponseEntity<List<Item>> getItems() {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore().mustRevalidate())
        .body(itemService.findAll());
}
```

---

### Fix 2: Connect `signal` in `queryFn` to Support Query Cancellation
Pass TanStack Query's `signal` to `fetch` or `axios` so obsolete in-flight refetches can be aborted:

```typescript
// ✅ FIXED: Passes signal to abort in-flight requests when invalidated
useQuery({
  queryKey: ['items'],
  queryFn: ({ signal }) => axios.get('/api/items', { signal }).then(res => res.data),
  refetchOnWindowFocus: true,
});
```

---

### Fix 3: Cancel In-Flight Queries in `useMutation.onMutate`
Before executing a mutation, abort any currently in-flight background refetches to prevent them from arriving late and clobbering the cache:

```typescript
const queryClient = useQueryClient();

const updateMutation = useMutation({
  // Abort any in-flight refetches before mutating
  onMutate: async () => {
    await queryClient.cancelQueries({ queryKey: ['items'] });
  },
  mutationFn: (updatedRow) => axios.put(`/api/items/${updatedRow.id}`, updatedRow),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['items'] });
  }
});
```

---

## 🧪 Testing in the Prototype App

Both the frontend and backend are running live:
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:4000](http://localhost:4000)

### Steps to Reproduce the HTTP Cache Bug in the UI:
1. Open [http://localhost:3000](http://localhost:3000).
2. Under **Network & HTTP Cache Diagnostics**, ensure **Browser Cache ON (Buggy)** is selected.
3. Click **Quick Update** on Row #1, change the name, and click **Save**.
4. The backend database updates to `v2`.
5. Click **Simulate Tab Switch (Focus Refetch)** (or switch to another browser tab and switch back).
6. **Notice the bug**:
   - The browser Network tab executes `GET /api/items`.
   - The status is `200 OK (from disk cache)`.
   - The response payload contains the **old v1 data**!
   - The red alert banner highlights the divergence between the Backend DB (`v2`) and the Table (`v1`).
7. Now click **no-store (Fixed)** under the Cache-Control toggle.
8. Click **Simulate Tab Switch (Focus Refetch)** again.
9. **Notice the fix**: The browser bypasses disk cache, hits the server, and the table instantly updates to `v2`!
