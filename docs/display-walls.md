# G-SPAN Display Walls

Display Walls extend the Screen Network from group-targeted signage into synchronized spatial playback. A wall is an ordered set of physical screens that act as viewports into one logical creative canvas.

## Domain boundaries

`ScreenGroup` remains the ordinary targeting primitive: every member receives the same campaign content independently.

`DisplayWall` is a spatial primitive. It stores the physical topology, logical canvas geometry and synchronization tolerance required to render one shared scene across multiple players.

Keeping these concepts separate prevents ordinary group delivery from inheriting synchronization requirements and lets one physical screen participate in normal campaigns outside a wall schedule.

## Topology

Each wall stores:

- rows and columns;
- logical canvas width and height;
- timezone;
- synchronization tolerance;
- an ordered `DisplayWallMember` for every assigned screen;
- each member's row, column, slot index, x/y origin and viewport width/height.

The initial production topology requires every member to use the same resolution and orientation. This gives the media processor deterministic crop regions and removes mixed-device geometry as a source of playback drift.

Examples using 1920×1080 screens:

| Layout | Screens | Logical canvas |
| --- | ---: | ---: |
| 12×1 ribbon | 12 | 23,040×1,080 |
| 25×1 ribbon | 25 | 48,000×1,080 |
| 5×5 wall | 25 | 9,600×5,400 |

The logical canvas is an authoring and processing coordinate space. Players do not need to decode the complete ultra-wide master.

## Media-processing contract

Heavy image/video slicing and transcoding should run in a dedicated media worker, not inside a latency-sensitive Next.js request handler.

The worker flow is:

1. Read the destination wall topology from the control plane.
2. Accept or generate a master matching the wall's exact logical canvas.
3. Render one tile per `DisplayWallMember` using that member's x/y/width/height crop.
4. Encode every video tile with identical frame rate, duration, time base and GOP/keyframe structure.
5. Upload the master and tiles to durable object storage/CDN.
6. POST the completed manifest to `POST /api/admin/display-walls/:id/creatives`.
7. The control plane validates the master dimensions, tile count, member IDs and tile dimensions before making the creative `READY`.

A representative 3-screen manifest is:

```json
{
  "name": "GP Mart brand sweep",
  "type": "VIDEO",
  "masterUrl": "https://media.example/master.mp4",
  "masterWidth": 5760,
  "masterHeight": 1080,
  "durationSec": 15,
  "sourceJobId": "wall-render-20260825-001",
  "tiles": [
    {
      "memberId": "member-screen-01",
      "url": "https://media.example/tile-01.mp4",
      "width": 1920,
      "height": 1080,
      "codec": "h264"
    },
    {
      "memberId": "member-screen-02",
      "url": "https://media.example/tile-02.mp4",
      "width": 1920,
      "height": 1080,
      "codec": "h264"
    },
    {
      "memberId": "member-screen-03",
      "url": "https://media.example/tile-03.mp4",
      "width": 1920,
      "height": 1080,
      "codec": "h264"
    }
  ]
}
```

The control plane intentionally accepts wall-master dimensions far beyond the ordinary creative-package preset limit. The ultra-wide master is a source artifact; normal-resolution tiles are the playback artifacts.

## Scheduling

Campaigns may target `SCREEN`, `GROUP` or `WALL`.

Publishing a wall target materializes one `ScheduleWindow` for every wall member and preserves the originating `displayWallId` on those rows. This gives each device the same campaign timeline while retaining its viewport identity.

A playlist may mix ordinary content and `DISPLAY_WALL` content. During a wall schedule:

- ordinary assets still play on every member;
- a `DISPLAY_WALL` item resolves to the tile assigned to the requesting screen;
- an unavailable wall item becomes a `SYNC_GAP` rather than being removed from one device's playlist, preserving the common timeline.

## Shared playback clock

Players do not synchronize by receiving a simultaneous "play now" command. They synchronize against an absolute timeline.

The playlist response supplies:

- `epochMs`: shared schedule start;
- `serverNowMs`: server time used to estimate device clock offset;
- `toleranceMs`: allowed playback drift;
- wall and viewport geometry.

The player estimates server-clock offset using the midpoint of the playlist request, then calculates:

```text
serverNow ≈ localNow + clockOffset
elapsed = serverNow - epoch
phase = elapsed mod playlistDuration
```

That phase determines the current playlist item and offset inside it. A player that launches or reconnects midway through an animation therefore seeks to the correct shared position instead of restarting from frame zero.

For wall video, the browser player periodically compares `video.currentTime` with the expected shared playhead and seeks when drift exceeds the configured tolerance. This provides application-level synchronization suitable for commodity players; installations requiring broadcast/frame-lock guarantees can later use a hardware synchronization mode without changing campaign semantics.

## Failure behavior

- Missing wall tile: render a black `SYNC_GAP` for the item's full scheduled duration.
- Temporary API loss: continue the last known timeline and retry playlist polling.
- Late player: join at the current wall phase.
- Topology change: existing tile mappings are invalidated and wall creatives return to `PROCESSING` until re-rendered.
- Wall with no members: cannot be published.
- Wall creative for the wrong wall: cannot be published into that wall schedule.

## Deployment boundary

The wall schema is additive but still requires an explicit database migration. Vercel builds do not apply migrations automatically.

```bash
npm run db:status
npm run db:deploy
```

After migration, verify `/api/v1/health` returns HTTP 200 and `ready: true` before testing wall creation, manifest import or synchronized player delivery.
