### Feature: Tailscale CIDRs bypass password and Cloudflare tunnel is opt-in

#### Prerequisites
- App is running from this repository via CLI.
- A Tailscale client can reach the host over Tailscale IPv4 (`100.64.0.0/10`) or IPv6 (`fd7a:115c:a1e0::/48`).
- `cloudflared` is installed only if testing `--tunnel`.

#### Steps
1. Start CLI without tunnel flag: `npx codexapp --port 5900`.
2. From a Tailscale client, open `http://100.x.x.x:5900` using a host address in `100.64.0.0/10` (replace with host tailnet IP).
3. Confirm the app opens directly without the password login page.
4. (Optional IPv6 check) Open the same service using the host Tailscale IPv6 address in `fd7a:115c:a1e0::/48` and confirm it also bypasses password.
5. Stop the server and start again with tunnel enabled: `npx codexapp --port 5900 --tunnel`.
6. Confirm startup output now includes a `Tunnel:` URL only when `--tunnel` is provided.
7. Stop and restart once more without `--tunnel`, and verify no tunnel URL is printed.

#### Expected Results
- Requests from Tailscale IPv4 `100.64.0.0/10` are treated as trusted and do not require password sign-in.
- Requests from Tailscale IPv6 `fd7a:115c:a1e0::/48` are treated as trusted and do not require password sign-in.
- Cloudflare tunnel does not start by default.
- Cloudflare tunnel starts only when `--tunnel` is explicitly passed.

#### Rollback/Cleanup
- Stop the CLI process.
- If a cloudflared tunnel was started, ensure the tunnel child process has exited.
