import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

// librsvg (what sharp rasterises with) does not support <textPath>, so the arc
// is built by placing each glyph on a circle itself. Letters are spaced by
// their approximate advance width rather than evenly, otherwise the narrow
// ones ('i') leave visible gaps.
const WORD = 'Brapids'
const ADVANCE = { B: 0.78, r: 0.56, a: 0.68, p: 0.74, i: 0.34, d: 0.74, s: 0.66 }

const GREEN = '#8ACE00'
const BLUE = '#1C63C8'
const YELLOW = '#FFD200'
const RIM = '#08265C'

const SIZE = 512
const CX = SIZE / 2
const RADIUS = 430          // circle the letters sit on
const CY = 250 + RADIUS     // centre below the canvas, so the arc bows upward
const SPREAD = 52           // total degrees of arc the word occupies
const FONT_SIZE = 128

const widths = [...WORD].map((c) => ADVANCE[c])
const total = widths.reduce((a, b) => a + b, 0)

// Angle for each glyph's centre, walking the cumulative width.
let walked = 0
const glyphs = [...WORD].map((char, i) => {
  const centre = walked + widths[i] / 2
  walked += widths[i]
  const t = centre / total - 0.5              // -0.5 .. +0.5
  const deg = t * SPREAD
  const rad = (deg * Math.PI) / 180
  return {
    char,
    x: CX + RADIUS * Math.sin(rad),
    y: CY - RADIUS * Math.cos(rad),
    deg,
  }
})

/** Three passes: dark rim, yellow band, blue face. Painting the whole word at
 *  each depth (rather than each letter fully) keeps the outline continuous
 *  where glyphs overlap. */
function layer(stroke, width) {
  return glyphs
    .map(
      (g) =>
        `<text x="${g.x.toFixed(1)}" y="${g.y.toFixed(1)}" transform="rotate(${g.deg.toFixed(2)} ${g.x.toFixed(1)} ${g.y.toFixed(1)})"` +
        (stroke
          ? ` fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"`
          : ` fill="${BLUE}"`) +
        `>${g.char}</text>`,
    )
    .join('\n      ')
}

function buildSvg({ scale, background = GREEN, width = SIZE, height = SIZE, viewBox = `0 0 ${SIZE} ${SIZE}` }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">
  ${background === 'none' ? '' : `<rect width="${SIZE}" height="${SIZE}" fill="${background}"/>`}

  <g transform="translate(${CX} ${CX}) scale(${scale}) translate(${-CX} ${-CX})">
  <g font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${FONT_SIZE}" font-weight="900" text-anchor="middle">
      ${layer(RIM, 42)}
      ${layer(YELLOW, 26)}
      ${layer(null)}
  </g>

  <g font-family="Georgia, Times New Roman, serif" font-size="58" font-style="italic" font-weight="700" text-anchor="middle">
    <text x="${CX}" y="410" fill="none" stroke="${RIM}" stroke-width="19" stroke-linejoin="round">Water Park</text>
    <text x="${CX}" y="410" fill="none" stroke="${YELLOW}" stroke-width="10" stroke-linejoin="round">Water Park</text>
    <text x="${CX}" y="410" fill="${BLUE}">Water Park</text>
  </g>
  </g>
</svg>
`
}

// Full-bleed artwork for the normal icons.
const svg = buildSvg({ scale: 1 })

// Android crops a "maskable" icon to a circle, which would slice the B and the
// s off the full-bleed version. This variant sits inside the safe zone.
const maskable = buildSvg({ scale: 0.72 })

writeFileSync('brand/logo.svg', svg)

for (const size of [180, 192, 512]) {
  await sharp(Buffer.from(svg), { density: 600 })
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon-${size}.png`)
}
await sharp(Buffer.from(maskable), { density: 600 })
  .resize(512, 512)
  .png()
  .toFile('public/icons/icon-maskable-512.png')
await sharp(Buffer.from(svg), { density: 600 }).resize(512, 512).png().toFile('brand/logo-preview.png')
await sharp(Buffer.from(maskable), { density: 600 }).resize(512, 512).png().toFile('brand/maskable-preview.png')
// Transparent, cropped to the word itself, for the app header — at 30px tall
// the "Water Park" line is unreadable, so the header uses the arc alone.
const wordmark = buildSvg({
  scale: 1,
  background: 'none',
  width: 660,
  height: 190,
  viewBox: '20 140 472 136',
})
await sharp(Buffer.from(wordmark), { density: 600 })
  .resize(660, 190)
  .png({ compressionLevel: 9 })
  .toFile('public/icons/wordmark.png')

console.log('rendered icons at 180, 192, 512, a padded maskable variant, and a header wordmark')
