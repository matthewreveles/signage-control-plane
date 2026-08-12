import { CREATIVE_PRESETS } from "@/lib/creative-packages";

type Context = { params: Promise<{ presetKey: string }> };

const PRESETS = [...CREATIVE_PRESETS.SIGNAGE, ...CREATIVE_PRESETS.REVIVE];

function escapeXml(value: string) {
  return value.replace(/[<>&\"']/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

function signageComposition({
  width,
  height,
  referenceUrl,
}: {
  width: number;
  height: number;
  referenceUrl: string;
}) {
  const portrait = height > width;
  const inset = Math.round(Math.min(width, height) * 0.06);
  const headlineSize = Math.round(width * (portrait ? 0.068 : 0.065));
  const detailSize = Math.round(Math.min(width, height) * 0.035);
  const panelWidth = portrait ? width - inset * 2 : Math.round(width * 0.74);
  const panelHeight = Math.round(panelWidth * (101 / 320));
  const panelX = Math.round((width - panelWidth) / 2);
  const panelY = portrait ? Math.round(height * 0.31) : Math.round(height * 0.29);
  const headlineY = portrait ? Math.round(height * 0.17) : Math.round(height * 0.22);
  const ctaY = portrait ? Math.round(height * 0.78) : Math.round(height * 0.82);

  return `
    <text x="${width / 2}" y="${inset + detailSize}" text-anchor="middle" class="eyebrow" font-size="${detailSize}">G-SPAN AI FACTORY PACKAGE</text>
    <text x="${width / 2}" y="${headlineY}" text-anchor="middle" class="headline" font-size="${headlineSize}" textLength="${width - inset * 2}" lengthAdjust="spacingAndGlyphs">FLAVOR THAT SLAPPS</text>
    <g>
      <rect x="${panelX - inset / 6}" y="${panelY + inset / 5}" width="${panelWidth + inset / 3}" height="${panelHeight + inset / 3}" rx="${Math.round(inset * 0.45)}" fill="#111827" opacity="0.35"/>
      <rect x="${panelX - inset / 3}" y="${panelY - inset / 3}" width="${panelWidth + (inset * 2) / 3}" height="${panelHeight + (inset * 2) / 3}" rx="${Math.round(inset * 0.45)}" fill="#111827"/>
      <image href="${escapeXml(referenceUrl)}" xlink:href="${escapeXml(referenceUrl)}" x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <rect x="${Math.round(width * 0.25)}" y="${ctaY - detailSize * 1.25}" width="${Math.round(width * 0.5)}" height="${detailSize * 2.15}" rx="${detailSize}" fill="#111827"/>
    <text x="${width / 2}" y="${ctaY}" text-anchor="middle" class="cta" font-size="${Math.round(detailSize * 0.9)}">FIND YOUR FLAVOR</text>
    <text x="${width / 2}" y="${height - inset}" text-anchor="middle" class="micro" font-size="${Math.max(14, Math.round(detailSize * 0.55))}">SCREEN NETWORK PROOF OF CONCEPT</text>
  `;
}

function displayComposition({
  width,
  height,
  referenceUrl,
}: {
  width: number;
  height: number;
  referenceUrl: string;
}) {
  const wide = width / height >= 3;
  const narrow = height / width >= 2;

  if (wide) {
    return `<image href="${escapeXml(referenceUrl)}" xlink:href="${escapeXml(referenceUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`;
  }

  if (narrow) {
    const logoHeight = Math.round(width * (101 / 320));
    const fontSize = Math.round(width * 0.13);
    return `
      <image href="${escapeXml(referenceUrl)}" xlink:href="${escapeXml(referenceUrl)}" x="0" y="${Math.round(height * 0.12)}" width="${width}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet"/>
      <text x="${width / 2}" y="${Math.round(height * 0.48)}" text-anchor="middle" class="stack" font-size="${fontSize}">FLAVOR</text>
      <text x="${width / 2}" y="${Math.round(height * 0.58)}" text-anchor="middle" class="stack" font-size="${fontSize}">THAT</text>
      <text x="${width / 2}" y="${Math.round(height * 0.68)}" text-anchor="middle" class="stack red" font-size="${fontSize}">SLAPPS</text>
      <rect x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.78)}" width="${Math.round(width * 0.76)}" height="${Math.round(height * 0.085)}" rx="${Math.round(width * 0.08)}" fill="#111827"/>
      <text x="${width / 2}" y="${Math.round(height * 0.835)}" text-anchor="middle" class="cta" font-size="${Math.round(width * 0.075)}">FIND YOUR FLAVOR</text>
    `;
  }

  const logoWidth = Math.round(width * 0.92);
  const logoHeight = Math.round(logoWidth * (101 / 320));
  return `
    <image href="${escapeXml(referenceUrl)}" xlink:href="${escapeXml(referenceUrl)}" x="${Math.round((width - logoWidth) / 2)}" y="${Math.round(height * 0.1)}" width="${logoWidth}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${width / 2}" y="${Math.round(height * 0.7)}" text-anchor="middle" class="stack" font-size="${Math.round(width * 0.09)}">FIND YOUR FLAVOR</text>
    <rect x="${Math.round(width * 0.24)}" y="${Math.round(height * 0.78)}" width="${Math.round(width * 0.52)}" height="${Math.round(height * 0.12)}" rx="${Math.round(height * 0.06)}" fill="#111827"/>
    <text x="${width / 2}" y="${Math.round(height * 0.858)}" text-anchor="middle" class="cta" font-size="${Math.round(width * 0.05)}">EXPLORE SLAPPS</text>
  `;
}

export async function GET(request: Request, context: Context) {
  const { presetKey } = await context.params;
  const preset = PRESETS.find((candidate) => candidate.key === presetKey);

  if (!preset) {
    return Response.json({ error: "Unknown creative preset" }, { status: 404 });
  }

  const referenceUrl = new URL("/demo/slapps-factory-reference.png", request.url).href;
  const isSignage = presetKey.startsWith("SIGNAGE_");
  const composition = isSignage
    ? signageComposition({ ...preset, referenceUrl })
    : displayComposition({ ...preset, referenceUrl });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${preset.width}" height="${preset.height}" viewBox="0 0 ${preset.width} ${preset.height}" role="img" aria-label="SLAPPS ${escapeXml(preset.label)} creative">
  <defs>
    <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="2.1" fill="#111827" opacity="0.22"/>
    </pattern>
    <radialGradient id="burst" cx="50%" cy="42%" r="78%">
      <stop offset="0" stop-color="#fff47a"/>
      <stop offset="0.55" stop-color="#ffd719"/>
      <stop offset="1" stop-color="#f4aa00"/>
    </radialGradient>
    <style>
      .eyebrow,.micro{font-family:Arial,Helvetica,sans-serif;font-weight:800;letter-spacing:.18em;fill:#111827}
      .headline,.stack{font-family:Impact,Haettenschweiler,'Arial Narrow Bold',sans-serif;font-weight:900;letter-spacing:.025em;fill:#1267b2;stroke:#111827;stroke-width:2;paint-order:stroke fill}
      .headline,.red{fill:#ef2327}
      .cta{font-family:Arial,Helvetica,sans-serif;font-weight:900;letter-spacing:.08em;fill:#fff}
    </style>
  </defs>
  <rect width="100%" height="100%" fill="url(#burst)"/>
  <rect width="100%" height="100%" fill="url(#dots)"/>
  ${composition}
  <rect x="1" y="1" width="${preset.width - 2}" height="${preset.height - 2}" fill="none" stroke="#111827" stroke-width="2"/>
</svg>`;

  return new Response(svg, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
