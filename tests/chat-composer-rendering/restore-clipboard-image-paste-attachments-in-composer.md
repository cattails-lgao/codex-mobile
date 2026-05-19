### Feature: Restore clipboard image paste attachments in composer

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Open any thread where the composer is enabled.
- Have an image copied to system clipboard (for example screenshot copy).

#### Steps
1. Focus the composer textarea.
2. Paste clipboard content that contains only an image file payload.
3. Confirm an image chip/preview is added to composer attachments.
4. Copy plain text only and paste into composer.
5. Copy mixed content (plain text + image, if source provides both) and paste once.
6. Copy long plain text (at least 2000 characters) and paste into composer.
7. Confirm the long text is attached as a `.txt` file instead of being inserted into the textarea.
8. Send the message with the pasted image/text attachment.

#### Expected Results
- Image-only clipboard paste adds an image attachment to composer.
- Plain-text paste still inserts text into the composer and does not create an attachment.
- Mixed payload paste attaches the image while preserving text paste behavior.
- Long plain-text paste (>= 2000 chars) creates a `.txt` attachment and does not insert raw text into the textarea.
- Sending proceeds with the attached pasted image.

#### Rollback/Cleanup
- Remove the attached image chip from composer if not needed.
