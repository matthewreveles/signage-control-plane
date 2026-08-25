# G-SPAN Screen Network

The Screen Network control plane receives approved creative packages from the G-SPAN AI Factory, schedules them as campaigns and resolves the best rendition for each paired display. It also supports synchronized Display Walls, where multiple physical screens become ordered viewports into one logical creative canvas.

## Proof-of-concept flow

1. AI Factory generates a brand-aware package.
2. `POST /api/admin/creative-packages` imports its manifest.
3. An operator reviews landscape and portrait coverage in `/packages`.
4. Approval makes the complete package available in `/campaigns`.
5. A browser player pairs at `/player` with the activation code from `/`.
6. The player polls its device playlist, receives the best matching variant and reports heartbeat and proof-of-play events.

The package remains one campaign object throughout the workflow. Revive variants are preserved in the same manifest for downstream web-ad delivery; Screen Network variants are selected at playback according to the target display's orientation, aspect ratio and resolution.

## Synchronized display walls

Display Walls are separate from ordinary Screen Groups. A group sends the same content to multiple independent screens; a wall maps screens to physical positions inside one shared canvas and runs them against one absolute playback clock.

Example: twelve consecutive 1920×1080 screens configured as a 12×1 wall produce a logical 23,040×1,080 canvas. A 25×1 installation produces 48,000×1,080. G-SPAN stores the logical geometry but delivers normal-resolution tiles to individual players rather than asking every device to decode the ultra-wide master.

Display-wall flow:

1. Create a wall in `/walls` and choose rows, columns and physical screen positions.
2. A media worker renders an exact logical master and one tile per wall member.
3. `POST /api/admin/display-walls/:id/creatives` imports the completed master/tile manifest.
4. Add the READY wall creative to a playlist or schedule it directly as a campaign.
5. Publish the campaign to the wall.
6. Each player receives its own tile plus shared epoch, server clock and viewport metadata.
7. Players resolve the current scene from the shared epoch and correct video drift when it exceeds the wall tolerance.

Players that start late or reconnect do not restart the animation. They calculate the current shared phase and join at the correct item and playhead offset.

Detailed topology, media-worker and synchronization contracts are documented in [`docs/display-walls.md`](docs/display-walls.md).

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

`DATABASE_URL_UNPOOLED` is preferred for Prisma Migrate; `DATABASE_URL` remains the fallback. Verify `/api/v1/health` returns HTTP 200 and `"ready": true` before exercising creative-package import, display-wall configuration, player pairing or proof-of-play. If the latest migration has not been applied, database-dependent pages render a deployment checkpoint instead of failing with an opaque HTTP 500.

## Verification

```bash
npm run smoke:screen-network
npm run smoke:display-walls
npm run db:status
npm run typecheck
npm run lint
npm run build
```
