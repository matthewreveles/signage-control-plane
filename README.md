# G-SPAN Screen Network

The Screen Network control plane receives approved creative packages from the G-SPAN AI Factory, schedules them as campaigns and resolves the best rendition for each paired display.

## Proof-of-concept flow

1. AI Factory generates a brand-aware package.
2. `POST /api/admin/creative-packages` imports its manifest.
3. An operator reviews landscape and portrait coverage in `/packages`.
4. Approval makes the complete package available in `/campaigns`.
5. A browser player pairs at `/player` with the activation code from `/`.
6. The player polls its device playlist, receives the best matching variant and reports heartbeat and proof-of-play events.

The package remains one campaign object throughout the workflow. Revive variants are preserved in the same manifest for downstream web-ad delivery; Screen Network variants are selected at playback according to the target display's orientation, aspect ratio and resolution.

## Preset families

Screen Network:

- 1920×1080 HD landscape
- 3840×2160 4K landscape
- 1080×1920 HD portrait
- 2160×3840 4K portrait

Revive display:

- 728×90 leaderboard
- 300×250 medium rectangle
- 160×600 wide skyscraper
- 320×50 mobile leaderboard
- 320×100 large mobile banner

## Local development

```bash
npm install
npx prisma migrate dev
npm run dev
```

The application requires `DATABASE_URL` for a PostgreSQL database.

## Deployment checkpoint

The application does not run database migrations as an implicit side effect of a Vercel build. Apply reviewed migrations as an explicit release step using the direct Neon connection when available:

```bash
npm run db:status
npm run db:deploy
```

`DATABASE_URL_UNPOOLED` is preferred for Prisma Migrate; `DATABASE_URL` remains the fallback. Verify `/api/v1/health` returns HTTP 200 and `"ready": true` before exercising creative-package import, player pairing or proof-of-play. If the migration has not been applied, database-dependent proof-of-concept pages render a deployment checkpoint instead of failing with an opaque HTTP 500.

## Verification

```bash
npm run smoke:screen-network
npm run db:status
npm run typecheck
npm run lint
npm run build
```
