import { z } from "zod";

export const displayWallSettingsSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(500).optional().nullable(),
  rows: z.number().int().min(1).max(20).default(1),
  columns: z.number().int().min(1).max(100).default(1),
  timezone: z.string().trim().min(1).max(120).default("America/Phoenix"),
  syncToleranceMs: z.number().int().min(16).max(1000).default(80),
  hardResyncMs: z.number().int().min(50).max(5000).default(350),
  preloadLeadSec: z.number().int().min(30).max(86400).default(300),
  startGuardMs: z.number().int().min(1000).max(60000).default(5000),
  requireAllMembersReady: z.boolean().default(true),
  failurePolicy: z
    .enum(["HOLD_LAST_READY", "FALLBACK_STANDARD"])
    .default("HOLD_LAST_READY"),
});

export const displayWallMemberInputSchema = z.object({
  screenId: z.string().trim().min(1),
  row: z.number().int().min(0),
  column: z.number().int().min(0),
});

export const displayWallMembersSchema = z.object({
  members: z.array(displayWallMemberInputSchema).max(200),
});

type ScreenGeometry = {
  id: string;
  width: number;
  height: number;
  orientation: "LANDSCAPE" | "PORTRAIT";
};

type MemberInput = z.infer<typeof displayWallMemberInputSchema>;

export type DisplayWallTopologyMember = {
  screenId: string;
  slotIndex: number;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DisplayWallTopology = {
  canvasWidth: number;
  canvasHeight: number;
  members: DisplayWallTopologyMember[];
};

export function buildDisplayWallTopology({
  rows,
  columns,
  members,
  screens,
}: {
  rows: number;
  columns: number;
  members: MemberInput[];
  screens: ScreenGeometry[];
}): DisplayWallTopology {
  if (!members.length) {
    return {
      canvasWidth: 0,
      canvasHeight: 0,
      members: [],
    };
  }

  const screenMap = new Map(screens.map((screen) => [screen.id, screen]));
  const uniqueScreenIds = new Set<string>();
  const uniqueSlots = new Set<string>();

  const firstScreen = screenMap.get(members[0].screenId);
  if (!firstScreen) {
    throw new Error("One or more selected screens do not exist.");
  }

  for (const member of members) {
    if (member.row >= rows || member.column >= columns) {
      throw new Error(
        `Screen position ${member.row + 1},${member.column + 1} is outside the ${rows}×${columns} wall.`,
      );
    }

    if (uniqueScreenIds.has(member.screenId)) {
      throw new Error("A screen can only occupy one position in the same display wall.");
    }
    uniqueScreenIds.add(member.screenId);

    const slotKey = `${member.row}:${member.column}`;
    if (uniqueSlots.has(slotKey)) {
      throw new Error("Two screens cannot occupy the same display-wall position.");
    }
    uniqueSlots.add(slotKey);

    const screen = screenMap.get(member.screenId);
    if (!screen) {
      throw new Error("One or more selected screens do not exist.");
    }

    if (
      screen.width !== firstScreen.width ||
      screen.height !== firstScreen.height ||
      screen.orientation !== firstScreen.orientation
    ) {
      throw new Error(
        "Display-wall members must use the same resolution and orientation. Mixed geometry can be added later through an advanced topology mode.",
      );
    }
  }

  const memberWidth = firstScreen.width;
  const memberHeight = firstScreen.height;

  return {
    canvasWidth: columns * memberWidth,
    canvasHeight: rows * memberHeight,
    members: members
      .map((member) => ({
        screenId: member.screenId,
        slotIndex: member.row * columns + member.column,
        row: member.row,
        column: member.column,
        x: member.column * memberWidth,
        y: member.row * memberHeight,
        width: memberWidth,
        height: memberHeight,
      }))
      .sort((a, b) => a.slotIndex - b.slotIndex),
  };
}

export function expectedWallCanvas({
  columns,
  rows,
  width,
  height,
}: {
  columns: number;
  rows: number;
  width: number;
  height: number;
}) {
  return {
    width: columns * width,
    height: rows * height,
  };
}
