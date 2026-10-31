# Explicitly owned published campaigns

Read the parent workshop instructions and current Stage 440 work order.

- Query only the owner-qualified published campaign API, with bounded paging.
  Do not derive campaign ownership from a game cookie, membership or draft title.
- Keep the list in the workshop owner boundary. Changing/revoking that identity
  releases all reads and late entry responses before another owner can render.
- Entry delegates to `../activation/enter-button.tsx`; listing never issues an
  invitation or replaces the browser's existing game session.
- Source draft links identify workshop content. Later draft edits do not rewrite
  the published campaign or its played history.
