### Feature: Reverse tunnel login is required unless request is trusted local or Tailscale

#### Prerequisites
- App is running with password enabled.
- One direct local browser session (`localhost`).
- One reverse tunnel path (for example SSH/Cloudflare forwarding) that reaches the same server.
- Optional Tailscale client in `100.64.0.0/10` or `fd7a:115c:a1e0::/48`.

#### Steps
1. Open app via `http://localhost:<port>` and confirm it opens without login when request is true local loopback.
2. Open app via reverse-tunnel URL and confirm login page is shown.
3. Enter correct password in reverse-tunnel URL and confirm session cookie allows access.
4. (Optional) Open app via Tailscale IP and confirm login is bypassed.

#### Expected Results
- Local loopback access is allowed without login prompt.
- Reverse-tunnel access does not bypass auth and requires password.
- Valid login on reverse-tunnel path creates session and grants access.
- Tailscale CIDR requests remain trusted.

#### Rollback/Cleanup
- Clear browser cookies for the app origin(s).
- Stop the CLI process.
