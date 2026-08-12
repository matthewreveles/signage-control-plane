import { z } from "zod";

export const CREATIVE_PRESETS = {
  SIGNAGE: [
    { key: "SIGNAGE_1920X1080", label: "HD landscape", width: 1920, height: 1080 },
    { key: "SIGNAGE_3840X2160", label: "4K landscape", width: 3840, height: 2160 },
    { key: "SIGNAGE_1080X1920", label: "HD portrait", width: 1080, height: 1920 },
    { key: "SIGNAGE_2160X3840", label: "4K portrait", width: 2160, height: 3840 },
  ],
  REVIVE: [
    { key: "REVIVE_728X90", label: "Leaderboard", width: 728, height: 90 },
    { key: "REVIVE_300X250", label: "Medium rectangle", width: 300, height: 250 },
    { key: "REVIVE_160X600", label: "Wide skyscraper", width: 160, height: 600 },
    { key: "REVIVE_320X50", label: "Mobile leaderboard", width: 320, height: 50 },
    { key: "REVIVE_320X100", label: "Large mobile banner", width: 320, height: 100 },
  ],
} as const;

export type CreativeDestination = keyof typeof CREATIVE_PRESETS;

const variantSchema = z.object({
  destination: z.enum(["SIGNAGE", "REVIVE"]),
  presetKey: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(180),
  type: z.enum(["IMAGE", "VIDEO"]).default("IMAGE"),
  url: z.string().url(),
  width: z.number().int().min(1).max(7680).optional(),
  height: z.number().int().min(1).max(7680).optional(),
  durationSec: z.number().int().min(1).max(3600).optional(),
});

export const factoryPackageSchema = z.object({
  name: z.string().trim().min(1).max(180),
  brand: z.string().trim().min(1).max(120),
  campaignMessage: z.string().trim().max(500).optional().nullable(),
  cta: z.string().trim().max(160).optional().nullable(),
  sourceSystem: z.string().trim().min(1).max(80).default("GSPAN_AI_FACTORY"),
  sourceJobId: z.string().trim().max(180).optional().nullable(),
  status: z.enum(["DRAFT", "PROCESSING", "REVIEW", "APPROVED", "FAILED"]).default("REVIEW"),
  variants: z.array(variantSchema).min(1).max(100),
});

export type FactoryPackageInput = z.infer<typeof factoryPackageSchema>;

export function resolveVariantDimensions(variant: FactoryPackageInput["variants"][number]) {
  const preset = CREATIVE_PRESETS[variant.destination].find(
    (candidate) => candidate.key === variant.presetKey,
  );

  if (preset) return { width: preset.width, height: preset.height };
  if (variant.width && variant.height) {
    return { width: variant.width, height: variant.height };
  }

  throw new Error(
    `Unknown preset ${variant.presetKey}; custom variants require width and height.`,
  );
}

export function orientationFor(width: number, height: number) {
  return width >= height ? ("LANDSCAPE" as const) : ("PORTRAIT" as const);
}

type SizedVariant = { width: number; height: number };

export function selectBestScreenVariant<T extends SizedVariant>(
  variants: T[],
  screen: SizedVariant,
): T | null {
  const screenOrientation = orientationFor(screen.width, screen.height);
  const screenRatio = screen.width / screen.height;
  const screenArea = screen.width * screen.height;

  const scored = variants
    .filter((variant) => orientationFor(variant.width, variant.height) === screenOrientation)
    .map((variant) => {
      if (variant.width === screen.width && variant.height === screen.height) {
        return { variant, score: 1_000_000 };
      }

      const ratioDelta = Math.abs(variant.width / variant.height - screenRatio) / screenRatio;
      const scaleDelta = Math.abs(
        Math.log2((variant.width * variant.height) / screenArea),
      );
      const upscalePenalty =
        variant.width < screen.width || variant.height < screen.height ? 250 : 0;

      return {
        variant,
        score: 10_000 - ratioDelta * 8_000 - scaleDelta * 500 - upscalePenalty,
      };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.variant ?? null;
}
