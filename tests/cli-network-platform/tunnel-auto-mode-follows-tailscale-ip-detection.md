### Feature: Tunnel auto mode follows Tailscale IP detection

#### Prerequisites
- App is running from this repository via CLI.
- One environment with detected Tailscale IP (`100.64.0.0/10` or `fd7a:115c:a1e0::/48`) and one without (or simulated by disabling Tailscale).

#### Steps
1. Start server without explicit tunnel flags: `npx codexapp --port 5900`.
2. In a host where Tailscale IP is detected, verify startup output includes `Tunnel:`.
3. In a host where Tailscale IP is not detected, verify startup output does not include `Tunnel:`.
4. Start server with explicit override `--no-tunnel` and verify no `Tunnel:` output even when Tailscale IP is present.
5. Start server with explicit override `--tunnel` and verify `Tunnel:` output even when Tailscale IP is not present.

#### Expected Results
- Without explicit flags, tunnel enablement follows Tailscale IP detection.
- `--no-tunnel` always disables tunnel startup.
- `--tunnel` always enables tunnel startup.

#### Rollback/Cleanup
- Stop the CLI process after each verification run.
- Ensure cloudflared child process exits after shutdown.
