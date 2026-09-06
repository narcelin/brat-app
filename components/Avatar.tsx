import { featuresFromSeed, type AvatarFeatures } from '../lib/domain/avatar'

/** Drawn inline rather than served as an image: there are tens of thousands of
 *  combinations, so nothing can be pre-rendered, and inline SVG is about a
 *  tenth the bytes of the PNGs it replaces with no extra requests. */

const RIM = '#08265C'

function Hair({ style, color }: { style: AvatarFeatures['hairStyle']; color: string }) {
  const stroke = { stroke: RIM, strokeWidth: 7, strokeLinejoin: 'round' as const }
  switch (style) {
    case 'tuft':
      return <path d="M118 46 q10 -30 26 -14 q-6 6 -4 16 z" fill={color} {...stroke} />
    case 'curls':
      return (
        <g fill={color} stroke={RIM} strokeWidth={7}>
          <circle cx={88} cy={66} r={20} />
          <circle cx={128} cy={52} r={23} />
          <circle cx={168} cy={66} r={20} />
        </g>
      )
    case 'pigtails':
      return (
        <g fill={color} {...stroke}>
          <circle cx={46} cy={74} r={26} />
          <circle cx={210} cy={74} r={26} />
          <path d="M62 78 q10 -46 66 -46 q56 0 66 46 q-66 -22 -132 0 z" />
        </g>
      )
    case 'swoosh':
      return <path d="M72 74 q30 -40 92 -22 q-28 -2 -44 12 q-24 -6 -48 10 z" fill={color} {...stroke} />
    case 'long':
      return (
        <path
          d="M48 96 q0 -60 80 -60 q80 0 80 60 l0 78 q-16 -40 -26 -62 q-54 18 -108 0 q-10 22 -26 62 z"
          fill={color}
          {...stroke}
        />
      )
    case 'beanie':
      return (
        <g {...stroke}>
          <path d="M66 80 q4 -46 62 -46 q58 0 62 46 z" fill={color} />
          <rect x={60} y={74} width={136} height={18} rx={9} fill={color} />
        </g>
      )
    default:
      return null
  }
}

function Eyes({ style }: { style: AvatarFeatures['eyes'] }) {
  switch (style) {
    case 'wide':
      return (
        <g>
          <circle cx={100} cy={113} r={24} fill="#fff" stroke={RIM} strokeWidth={7} />
          <circle cx={156} cy={113} r={24} fill="#fff" stroke={RIM} strokeWidth={7} />
          <circle cx={100} cy={115} r={9} fill={RIM} />
          <circle cx={156} cy={115} r={9} fill={RIM} />
        </g>
      )
    case 'sleepy':
      return (
        <g>
          <circle cx={102} cy={114} r={19} fill="#fff" stroke={RIM} strokeWidth={7} />
          <circle cx={154} cy={114} r={19} fill="#fff" stroke={RIM} strokeWidth={7} />
          <circle cx={102} cy={118} r={8} fill={RIM} />
          <circle cx={154} cy={118} r={8} fill={RIM} />
          {/* Lids sit over the top half — the whole point of the look. */}
          <path d="M82 110 a20 20 0 0 1 40 0 z" fill={RIM} />
          <path d="M134 110 a20 20 0 0 1 40 0 z" fill={RIM} />
        </g>
      )
    case 'side':
      return (
        <g>
          <circle cx={102} cy={114} r={19} fill="#fff" stroke={RIM} strokeWidth={7} />
          <circle cx={154} cy={114} r={19} fill="#fff" stroke={RIM} strokeWidth={7} />
          <circle cx={112} cy={116} r={8} fill={RIM} />
          <circle cx={164} cy={116} r={8} fill={RIM} />
        </g>
      )
    case 'beady':
      return (
        <g>
          <circle cx={106} cy={114} r={9} fill={RIM} />
          <circle cx={150} cy={114} r={9} fill={RIM} />
        </g>
      )
    default:
      return (
        <g>
          <circle cx={102} cy={114} r={19} fill="#fff" stroke={RIM} strokeWidth={7} />
          <circle cx={154} cy={114} r={19} fill="#fff" stroke={RIM} strokeWidth={7} />
          <circle cx={105} cy={117} r={8} fill={RIM} />
          <circle cx={157} cy={117} r={8} fill={RIM} />
        </g>
      )
  }
}

function Eyewear({ style }: { style: AvatarFeatures['eyewear'] }) {
  const frame = { fill: 'none', stroke: RIM, strokeWidth: 8, strokeLinecap: 'round' as const }
  switch (style) {
    case 'round':
      return (
        <g {...frame}>
          <circle cx={102} cy={114} r={27} />
          <circle cx={154} cy={114} r={27} />
          <path d="M129 114 h-2" />
          <path d="M75 108 L60 116" />
          <path d="M181 108 L196 116" />
        </g>
      )
    case 'square':
      return (
        <g {...frame}>
          <rect x={76} y={92} width={52} height={44} rx={7} />
          <rect x={128} y={92} width={52} height={44} rx={7} />
          <path d="M60 100 L76 106" />
          <path d="M196 100 L180 106" />
        </g>
      )
    case 'shades':
      return (
        <g>
          <path d="M72 96 h50 v26 q0 20 -25 20 q-25 0 -25 -24 z" fill={RIM} />
          <path d="M134 96 h50 v22 q0 24 -25 24 q-25 0 -25 -20 z" fill={RIM} />
          <path d="M122 102 h12" stroke={RIM} strokeWidth={8} />
        </g>
      )
    default:
      return null
  }
}

function Mouth({ style }: { style: AvatarFeatures['mouth'] }) {
  switch (style) {
    case 'smile':
      return <path d="M106 154 q22 18 44 0" fill="none" stroke={RIM} strokeWidth={8} strokeLinecap="round" />
    case 'tongue':
      return (
        <g>
          <path d="M104 152 q24 26 48 0 z" fill={RIM} />
          <path d="M120 168 q8 16 16 0 z" fill="#FF6B8A" stroke={RIM} strokeWidth={5} />
        </g>
      )
    case 'oh':
      return <ellipse cx={128} cy={160} rx={13} ry={16} fill={RIM} />
    case 'smirk':
      return <path d="M106 156 q26 14 42 -6" fill="none" stroke={RIM} strokeWidth={8} strokeLinecap="round" />
    default:
      return <path d="M104 156 q24 24 48 0 z" fill={RIM} />
  }
}

export function Avatar({
  seed,
  className,
  title,
}: {
  seed: number
  className?: string
  title?: string
}) {
  const f = featuresFromSeed(seed)

  return (
    <svg viewBox="0 0 256 256" className={className} role={title ? 'img' : 'presentation'}>
      {title && <title>{title}</title>}
      <rect width={256} height={256} fill="#8ACE00" />

      <rect x={106} y={146} width={44} height={72} rx={16} fill={f.skin} stroke={RIM} strokeWidth={9} />
      <path
        d="M34 256 q0 -60 94 -60 q94 0 94 60 z"
        fill={f.shirt}
        stroke={RIM}
        strokeWidth={9}
        strokeLinejoin="round"
      />

      <circle cx={56} cy={126} r={17} fill={f.skin} stroke={RIM} strokeWidth={8} />
      <circle cx={200} cy={126} r={17} fill={f.skin} stroke={RIM} strokeWidth={8} />
      <ellipse cx={128} cy={120} rx={72} ry={68} fill={f.skin} stroke={RIM} strokeWidth={9} />

      <Hair style={f.hairStyle} color={f.hairColor} />
      <Eyes style={f.eyes} />
      <Eyewear style={f.eyewear} />

      {f.freckles && (
        <g fill={RIM} opacity={0.55}>
          <circle cx={84} cy={140} r={4} />
          <circle cx={96} cy={148} r={4} />
          <circle cx={160} cy={148} r={4} />
          <circle cx={172} cy={140} r={4} />
        </g>
      )}

      <Mouth style={f.mouth} />
    </svg>
  )
}
