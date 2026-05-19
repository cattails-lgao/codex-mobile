### Feature: Markdown link with backticked label renders as file link

#### Prerequisites
- App is running from this repository.
- An active thread is open.
- File exists at `/Users/igor/temp/TestChat/qwe.txt`.

#### Steps
1. Send this exact message:
   [`/Users/igor/temp/TestChat/qwe.txt`](/Users/igor/temp/TestChat/qwe.txt)
2. In the rendered message, confirm it appears as one clickable file link.
3. Verify the visible link text is `/Users/igor/temp/TestChat/qwe.txt` (without backticks).
4. Click the link and confirm it opens local browse for the full file path.

#### Expected Results
- Backticks inside markdown label do not break markdown-link parsing.
- The label renders as plain link text (no backtick glyphs).
- Clicking opens `/codex-local-browse/Users/igor/temp/TestChat/qwe.txt`.

#### Rollback/Cleanup
- Remove test file if it was created only for this verification.
