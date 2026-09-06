import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

// Original characters, drawn to sit beside the Brapids wordmark: the same
// heavy navy outline and saturated flat fills, no gradients or shading.
const RIM = '#08265C'
const S = 256          // canvas
const CX = 128

const HAIR = {
  none: () => '',
  tuft: (c) =>
    `<path d="M118 46 q10 -30 26 -14 q-6 6 -4 16 z" fill="${c}" stroke="${RIM}" stroke-width="7" stroke-linejoin="round"/>`,
  curls: (c) =>
    `<g fill="${c}" stroke="${RIM}" stroke-width="7">
       <circle cx="88" cy="66" r="20"/><circle cx="128" cy="52" r="23"/><circle cx="168" cy="66" r="20"/>
     </g>`,
  pigtails: (c) =>
    `<g fill="${c}" stroke="${RIM}" stroke-width="7" stroke-linejoin="round">
       <circle cx="46" cy="74" r="26"/><circle cx="210" cy="74" r="26"/>
       <path d="M62 78 q10 -46 66 -46 q56 0 66 46 q-66 -22 -132 0 z"/>
     </g>`,
  swoosh: (c) =>
    `<path d="M72 74 q30 -40 92 -22 q-28 -2 -44 12 q-24 -6 -48 10 z" fill="${c}" stroke="${RIM}" stroke-width="7" stroke-linejoin="round"/>`,
  // Side locks sit outside the head, not across the temples — drawn any
  // narrower they frame the eyes and read as spectacles.
  long: (c) =>
    `<path d="M48 96 q0 -60 80 -60 q80 0 80 60 l0 78 q-16 -40 -26 -62 q-54 18 -108 0 q-10 22 -26 62 z" fill="${c}" stroke="${RIM}" stroke-width="7" stroke-linejoin="round"/>`,
  beanie: (c) =>
    `<g stroke="${RIM}" stroke-width="7" stroke-linejoin="round">
       <path d="M66 80 q4 -46 62 -46 q58 0 62 46 z" fill="${c}"/>
       <rect x="60" y="74" width="136" height="18" rx="9" fill="${c}"/>
     </g>`,
}

const MOUTH = {
  grin: `<path d="M104 156 q24 24 48 0 z" fill="${RIM}"/>`,
  smile: `<path d="M106 154 q22 18 44 0" fill="none" stroke="${RIM}" stroke-width="8" stroke-linecap="round"/>`,
  tongue: `<g><path d="M104 152 q24 26 48 0 z" fill="${RIM}"/><path d="M120 168 q8 16 16 0 z" fill="#FF6B8A" stroke="${RIM}" stroke-width="5"/></g>`,
  oh: `<ellipse cx="128" cy="160" rx="13" ry="16" fill="${RIM}"/>`,
}

function avatar({ skin, hair, hairColor, shirt, mouth, glasses = false, freckles = false }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="#8ACE00"/>

  <!-- neck, drawn first so the head and the shirt both sit over it -->
  <rect x="106" y="146" width="44" height="72" rx="16" fill="${skin}" stroke="${RIM}" stroke-width="9"/>

  <!-- shoulders -->
  <path d="M34 256 q0 -60 94 -60 q94 0 94 60 z" fill="${shirt}" stroke="${RIM}" stroke-width="9" stroke-linejoin="round"/>

  <!-- ears -->
  <circle cx="56" cy="126" r="17" fill="${skin}" stroke="${RIM}" stroke-width="8"/>
  <circle cx="200" cy="126" r="17" fill="${skin}" stroke="${RIM}" stroke-width="8"/>

  <!-- head -->
  <ellipse cx="${CX}" cy="120" rx="72" ry="68" fill="${skin}" stroke="${RIM}" stroke-width="9"/>

  ${HAIR[hair](hairColor)}

  <!-- eyes -->
  <g>
    <circle cx="102" cy="114" r="19" fill="#fff" stroke="${RIM}" stroke-width="7"/>
    <circle cx="154" cy="114" r="19" fill="#fff" stroke="${RIM}" stroke-width="7"/>
    <circle cx="105" cy="117" r="8" fill="${RIM}"/>
    <circle cx="157" cy="117" r="8" fill="${RIM}"/>
  </g>
  ${glasses ? `<g fill="none" stroke="${RIM}" stroke-width="8" stroke-linecap="round">
    <circle cx="102" cy="114" r="27"/><circle cx="154" cy="114" r="27"/>
    <line x1="129" y1="114" x2="127" y2="114"/>
    <line x1="75" y1="108" x2="60" y2="116"/><line x1="181" y1="108" x2="196" y2="116"/>
  </g>` : ''}
  ${freckles ? `<g fill="${RIM}" opacity=".55"><circle cx="84" cy="140" r="4"/><circle cx="96" cy="148" r="4"/><circle cx="160" cy="148" r="4"/><circle cx="172" cy="140" r="4"/></g>` : ''}

  ${MOUTH[mouth]}
</svg>
`
}

const CAST = {
  1: { skin: '#F6C89A', hair: 'none',     hairColor: '#000',    shirt: '#1C63C8', mouth: 'grin' },
  2: { skin: '#E8A87C', hair: 'curls',    hairColor: '#D9581F', shirt: '#2FA84F', mouth: 'smile', glasses: true },
  3: { skin: '#F9D7B7', hair: 'pigtails', hairColor: '#F2B705', shirt: '#E8467C', mouth: 'oh' },
  4: { skin: '#C98A5E', hair: 'tuft',     hairColor: '#3A2416', shirt: '#7B4FD1', mouth: 'tongue' },
  5: { skin: '#8D5A3B', hair: 'curls',    hairColor: '#1B1108', shirt: '#E23B3B', mouth: 'grin' },
  6: { skin: '#FBE0C4', hair: 'swoosh',   hairColor: '#E8C24A', shirt: '#17A6A6', mouth: 'smile', freckles: true },
  7: { skin: '#6F4527', hair: 'beanie',   hairColor: '#FFD200', shirt: '#F07A1A', mouth: 'oh' },
  8: { skin: '#F2C9A0', hair: 'long',     hairColor: '#6B3410', shirt: '#1C63C8', mouth: 'tongue' },
}

mkdirSync('public/avatars', { recursive: true })
const sheet = []
for (const [id, spec] of Object.entries(CAST)) {
  const svg = avatar(spec)
  writeFileSync(`brand/avatar-${id}.svg`, svg)
  await sharp(Buffer.from(svg), { density: 400 })
    .resize(256, 256)
    .png({ compressionLevel: 9 })
    .toFile(`public/avatars/${id}.png`)
  sheet.push({ input: `public/avatars/${id}.png`, left: ((id - 1) % 4) * 256, top: Math.floor((id - 1) / 4) * 256 })
}

// One contact sheet so the whole cast can be judged at once.
await sharp({ create: { width: 1024, height: 512, channels: 4, background: '#111' } })
  .composite(sheet)
  .png()
  .toFile('brand/avatars-preview.png')

console.log(`rendered ${sheet.length} avatars`)
