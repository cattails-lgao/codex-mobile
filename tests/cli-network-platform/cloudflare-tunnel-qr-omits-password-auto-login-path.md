### Feature: Cloudflare tunnel QR omits password auto-login path

#### Prerequisites
- App is running from this repository with password enabled.
- Cloudflare tunnel startup is enabled (`--tunnel` or auto-enabled path).

#### Steps
1. Start CLI and wait for tunnel output.
2. Verify the printed `Tunnel:` URL does not include a `/password=` suffix.
3. Scan the terminal QR code from a phone/browser.
4. Confirm first page load shows the password form when no trusted bypass applies.
5. Use the generated password file path from startup output to retrieve the password and sign in.

#### Expected Results
- Tunnel URL shown in startup output does not expose the password.
- QR code encodes the base tunnel URL without a password-bearing path.
- The generated password remains available from the local password file.
- Base tunnel URL requires login when no trusted bypass applies.

#### Rollback/Cleanup
- Stop the CLI process.
- Clear cookies for the tunnel origin if needed.
