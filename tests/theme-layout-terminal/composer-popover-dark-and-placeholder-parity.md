### Feature: Composer popover shared surface, dark theme coverage, and placeholder parity (P1-5)

#### Prerequisites
- App is running from this repository (dev server on `127.0.0.1:4173`).
- An active thread is open so the composer input is enabled.
- Appearance setting is available in Settings (`codex-web-local.dark-mode.v1`).

#### Steps
1. Composer placeholder copy: with an active thread selected, confirm the input placeholder reads `Ask Codex anything, @ to add files, / for commands` in English. Switch UI language to `简体中文` and confirm it reads `向 Codex 提问，@ 添加文件，/ 执行命令`.
2. Slash command menu in light theme: focus the composer, type `/c`, and confirm the command menu popover opens above the input with a white surface, rounded corners, and shadow.
3. Slash command menu in dark theme: set Appearance to `Dark`, repeat step 2, and confirm the popover surface is dark (no white panel), the command name text is light, and the description text is readable.
4. File mention picker in dark theme: in the composer type `@` and confirm the mention popover uses the same dark surface and that file names, icons, and the empty state are readable.
5. Popover entrance motion: reopen the slash menu and confirm it fades in and rises ~8px over ~150ms; both popovers use the same motion.
6. Mobile viewports: resize to 375x812 and 768x1024, open the slash menu, and confirm the popover stays inside the viewport (no horizontal overflow) and does not cover the input.
7. Confirm no light-theme-only popover styling remains: toggle dark/light and verify the popover surfaces follow the theme, including the attach menu next to the composer.

#### Expected Results
- Placeholder copy matches Codex.app guidance copy and has both en/zh-CN translations.
- Mention picker and slash command menu share one popover surface (same border, radius, shadow, z-index, and 150ms ease-out entrance animation).
- Dark theme has no leftover light surfaces: popover background is `zinc-800`, primary text is `zinc-100`, secondary text stays readable.
- Popovers fit 375x812 and 768x1024 viewports without overflow.
- Light theme appearance is unchanged.

#### Rollback/Cleanup
- Return Appearance and UI language settings to the previous user preferences.
