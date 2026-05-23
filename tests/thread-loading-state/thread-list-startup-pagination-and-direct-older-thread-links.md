### Thread list startup pagination and direct older-thread links

#### Feature/Change Name
Thread loading uses a smaller initial list page, hydrates later pages in the background, and direct thread URLs are not rejected just because the thread is outside the first page.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Browser dev tools Network panel open
3. More than 50 existing threads, including a valid older thread outside the first updated page

#### Steps
1. Open the app home route
2. Inspect the first `thread/list` RPC request
3. Keep the app open and watch subsequent `thread/list` RPC requests
4. Open `/thread/<older-thread-id>` directly for a valid thread outside the first page

#### Expected Results
- The first `thread/list` request uses a smaller initial limit instead of 100
- Later thread pages load in the background using `nextCursor`
- The sidebar gains older threads as background pages complete
- The direct older thread URL stays on the thread route and loads messages instead of redirecting home

#### Rollback/Cleanup
- None

---
