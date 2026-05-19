### Bold URL trailing punctuation parsing

#### Feature/Change Name
Bold-wrapped plain URLs followed by punctuation render as clean links.

#### Prerequisites/Setup
1. Start local Vite: `pnpm run dev --host 127.0.0.1 --port 4173`.
2. Open the `TestChat` project and use an existing thread or create a new one.

#### Steps
1. In light theme, send a message containing `**https://example.com**.`.
2. Inspect the rendered message row.
3. Confirm the URL text is rendered as a link with `href` and `title` equal to `https://example.com`.
4. Confirm the final period remains visible as plain text after the link.
5. Repeat in dark theme and confirm the link and punctuation remain readable.

#### Expected Results
- The bold asterisk wrapper is removed from the rendered URL.
- Trailing punctuation is not included in the link target.
- Light and dark themes both render the link and punctuation clearly.

#### Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.
