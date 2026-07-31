// Renders public/icon.svg into the PNG sizes browsers want for installability.
// Dev-only: run `node scripts/make-icons.mjs` after changing icon.svg, then
// commit the PNGs. sharp is a devDependency and never reaches the client.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const BACKGROUND = "#047857";

// Maskable icons get cropped to whatever shape the launcher uses (circle,
// squircle, rounded square). Keeping the artwork inside the middle ~60% means
// nothing important is ever clipped.
const SAFE_ZONE_RATIO = 0.6;

const source = await readFile(join(publicDir, "icon.svg"));

async function render(size) {
  const artwork = Math.round(size * SAFE_ZONE_RATIO);
  const inset = Math.round((size - artwork) / 2);

  // Re-render the SVG at the inner size so strokes stay crisp rather than
  // rasterizing once and scaling down.
  const glyph = await sharp(source, { density: 384 })
    .resize(artwork, artwork, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // The source SVG already paints a rounded emerald card; flatten it onto a
  // full-bleed emerald square so the maskable crop never exposes a corner.
  const png = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BACKGROUND
    }
  })
    .composite([{ input: glyph, top: inset, left: inset }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  const out = join(publicDir, `icon-${size}.png`);
  await writeFile(out, png);
  console.log(`wrote public/icon-${size}.png (${png.length} bytes)`);
}

for (const size of [192, 512]) await render(size);
