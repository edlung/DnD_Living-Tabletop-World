# Stored campaign preview

- `scope.ts` pins revision and perspective. A location is a camera, never a holder move.
- `api.ts` validates public DTOs and the exact selected character on every read. Preview
  byte URLs retain the same scope and use the workshop owner-bound transport.
- `tab.tsx` is owner-only and loads the catalogue. `editor.tsx` unmounts that entire
  editor before mounting the restricted character branch; no owner package or catalogue
  is passed down to it. The restricted branch has no image-management context.
- `world.tsx` consumes projected scene DTOs. Prepared encounters exist only for the
  owner and reuse the Board with static positions, without a fake turn or combat HUD.
- Each perspective/revision/manifest mounts new image consumers and releases old
  object URLs. Abort and generation closure also reject late data.
- `entity-panel.tsx` reads details and the complete sheet lazily. No gameplay command,
  narrative execution, invented presence, memory or settlement belongs here.
- Styles/dictionary: `styles/workshop-preview.css`, `i18n/ru-workshop-preview.ts`.
  Inspect 1440/768/390/320 px after layout changes.
