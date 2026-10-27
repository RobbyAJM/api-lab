import type { DiceBearStyle } from './dicebear.ts';

export interface StyleComponent {
  id: string;
  label: string;
  variants: string[];
}

export interface StyleDefinition {
  id: DiceBearStyle;
  label: string;
  description: string;
  components: StyleComponent[];
}

const generateVariants = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);

export const DICEBEAR_STYLE_DEFINITIONS: StyleDefinition[] = [
  {
    id: 'croodles-neutral',
    label: 'Croodles Neutral',
    description: 'Minimalist hand-drawn doodle faces by Vijay Verma',
    components: [
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 16) },
      { id: 'mouth', label: 'Mouth', variants: generateVariants('variant', 18) },
      { id: 'nose', label: 'Nose', variants: generateVariants('variant', 9) },
    ],
  },
  {
    id: 'croodles',
    label: 'Croodles',
    description: 'Doodle characters with accessories and hair by Vijay Verma',
    components: [
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 16) },
      { id: 'mouth', label: 'Mouth', variants: generateVariants('variant', 18) },
      { id: 'nose', label: 'Nose', variants: generateVariants('variant', 9) },
      { id: 'top', label: 'Hair / Hat', variants: generateVariants('variant', 29) },
      { id: 'beard', label: 'Beard', variants: generateVariants('variant', 5) },
      { id: 'face', label: 'Face Shape', variants: generateVariants('variant', 8) },
    ],
  },
  {
    id: 'bottts',
    label: 'Bottts',
    description: 'Playful robot avatars with antennas and monitors by Pablo Stanley',
    components: [
      {
        id: 'eyes',
        label: 'Eyes',
        variants: [
          'bulging',
          'dizzy',
          'eva',
          'frame1',
          'frame2',
          'glow',
          'happy',
          'hearts',
          'robocop',
          'round',
          'roundFrame01',
          'roundFrame02',
          'sensor',
          'shade01',
        ],
      },
      {
        id: 'mouth',
        label: 'Mouth',
        variants: [
          'bite',
          'diagram',
          'grill01',
          'grill02',
          'grill03',
          'smile01',
          'smile02',
          'square01',
          'square02',
        ],
      },
      {
        id: 'top',
        label: 'Top Antenna',
        variants: [
          'antenna',
          'antennaCrooked',
          'bulb01',
          'glowingBulb01',
          'glowingBulb02',
          'horns',
          'lights',
          'pyramid',
          'radar',
        ],
      },
      {
        id: 'sides',
        label: 'Sides',
        variants: [
          'antenna01',
          'antenna02',
          'cables01',
          'cables02',
          'round',
          'square',
          'squareAssymetric',
        ],
      },
      {
        id: 'face',
        label: 'Face Shape',
        variants: ['round01', 'round02', 'square01', 'square02', 'square03', 'square04'],
      },
      {
        id: 'texture',
        label: 'Texture',
        variants: [
          'camo01',
          'camo02',
          'circuits',
          'dirty01',
          'dirty02',
          'dots',
          'grunge01',
          'grunge02',
        ],
      },
    ],
  },
  {
    id: 'avataaars',
    label: 'Avataaars',
    description: 'Popular cartoon character generator by Pablo Stanley',
    components: [
      {
        id: 'eyes',
        label: 'Eyes',
        variants: [
          'closed',
          'cry',
          'default',
          'eyeRoll',
          'happy',
          'hearts',
          'side',
          'squint',
          'surprised',
          'winkWacky',
          'wink',
          'xDizzy',
        ],
      },
      {
        id: 'mouth',
        label: 'Mouth',
        variants: [
          'concerned',
          'default',
          'disbelief',
          'eating',
          'grimace',
          'sad',
          'screamOpen',
          'serious',
          'smile',
          'tongue',
          'twinkle',
          'vomit',
        ],
      },
      {
        id: 'top',
        label: 'Hair / Hat',
        variants: [
          'hat',
          'hijab',
          'turban',
          'winterHat1',
          'winterHat02',
          'winterHat03',
          'winterHat04',
          'bob',
          'bun',
          'curly',
          'curvy',
          'dreads',
          'frida',
          'fro',
          'froBand',
          'longButNotTooLong',
          'miaWallace',
          'shavedSides',
          'straight02',
          'straight01',
          'straightAndStrand',
          'dreads01',
          'dreads02',
          'frizzle',
          'shaggy',
          'shaggyMullet',
          'shortCurly',
          'shortFlat',
          'shortRound',
          'shortWaved',
          'sides',
          'theCaesar',
          'theCaesarAndSidePart',
          'bigHair',
        ],
      },
      {
        id: 'accessories',
        label: 'Accessories',
        variants: [
          'kurt',
          'prescription01',
          'prescription02',
          'round',
          'sunglasses',
          'wayfarers',
          'eyepatch',
        ],
      },
      {
        id: 'eyebrows',
        label: 'Eyebrows',
        variants: [
          'angryNatural',
          'defaultNatural',
          'flatNatural',
          'frownNatural',
          'raisedExcitedNatural',
          'sadConcernedNatural',
          'unibrowNatural',
          'upDownNatural',
          'angry',
          'default',
          'raisedExcited',
          'sadConcerned',
          'upDown',
        ],
      },
      {
        id: 'facialHair',
        label: 'Facial Hair',
        variants: [
          'beardLight',
          'beardMajestic',
          'beardMedium',
          'moustacheFancy',
          'moustacheMagnum',
        ],
      },
      {
        id: 'clothing',
        label: 'Clothing',
        variants: [
          'blazerAndShirt',
          'blazerAndSweater',
          'collarAndSweater',
          'graphicShirt',
          'hoodie',
          'overall',
          'shirtCrewNeck',
          'shirtScoopNeck',
          'shirtVNeck',
        ],
      },
    ],
  },
  {
    id: 'lorelei',
    label: 'Lorelei',
    description: 'Modern illustrated portraits with clean lines by Lisa Wischofsky',
    components: [
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 24) },
      {
        id: 'mouth',
        label: 'Mouth',
        variants: [
          ...generateVariants('happy', 18),
          ...generateVariants('sad', 9),
        ],
      },
      { id: 'hair', label: 'Hair', variants: generateVariants('variant', 48) },
      { id: 'eyebrows', label: 'Eyebrows', variants: generateVariants('variant', 13) },
      { id: 'glasses', label: 'Glasses', variants: generateVariants('variant', 5) },
      { id: 'nose', label: 'Nose', variants: generateVariants('variant', 6) },
      { id: 'earrings', label: 'Earrings', variants: generateVariants('variant', 3) },
      { id: 'beard', label: 'Beard', variants: generateVariants('variant', 2) },
    ],
  },
  {
    id: 'fun-emoji',
    label: 'Fun Emoji',
    description: 'Expressive cute emoji style avatars',
    components: [
      {
        id: 'eyes',
        label: 'Eyes',
        variants: [
          'sad',
          'tearDrop',
          'pissed',
          'cute',
          'wink',
          'wink2',
          'plain',
          'glasses',
          'closed',
          'love',
          'stars',
          'shades',
          'closed2',
          'crying',
          'sleepClose',
        ],
      },
      {
        id: 'mouth',
        label: 'Mouth',
        variants: [
          'plain',
          'lilSmile',
          'sad',
          'shy',
          'cute',
          'wideSmile',
          'shout',
          'smileTeeth',
          'smileLol',
          'pissed',
          'drip',
          'tongueOut',
          'kissHeart',
          'sick',
          'faceMask',
        ],
      },
    ],
  },
  {
    id: 'pixel-art',
    label: 'Pixel Art',
    description: 'Classic retro 8-bit style characters',
    components: [
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 12) },
      {
        id: 'mouth',
        label: 'Mouth',
        variants: [
          ...generateVariants('happy', 13),
          ...generateVariants('sad', 10),
        ],
      },
      {
        id: 'hair',
        label: 'Hair',
        variants: [
          ...generateVariants('short', 24),
          ...generateVariants('long', 21),
        ],
      },
      {
        id: 'glasses',
        label: 'Glasses',
        variants: [
          ...generateVariants('light', 7),
          ...generateVariants('dark', 7),
        ],
      },
      { id: 'hat', label: 'Hat', variants: generateVariants('variant', 10) },
      { id: 'beard', label: 'Beard', variants: generateVariants('variant', 8) },
      { id: 'accessories', label: 'Accessories', variants: generateVariants('variant', 4) },
    ],
  },
  {
    id: 'notionists',
    label: 'Notionists',
    description: 'Clean monochrome Notion-inspired portraits',
    components: [
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 5) },
      { id: 'nose', label: 'Nose', variants: generateVariants('variant', 20) },
      { id: 'lips', label: 'Lips', variants: generateVariants('variant', 30) },
      {
        id: 'hair',
        label: 'Hair',
        variants: [...generateVariants('variant', 63), 'hat'],
      },
      { id: 'brows', label: 'Brows', variants: generateVariants('variant', 13) },
      { id: 'glasses', label: 'Glasses', variants: generateVariants('variant', 11) },
      { id: 'beard', label: 'Beard', variants: generateVariants('variant', 12) },
    ],
  },
  {
    id: 'adventurer',
    label: 'Adventurer',
    description: 'RPG fantasy portraits with expressive features',
    components: [
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 26) },
      { id: 'mouth', label: 'Mouth', variants: generateVariants('variant', 30) },
      { id: 'eyebrows', label: 'Eyebrows', variants: generateVariants('variant', 15) },
      {
        id: 'hair',
        label: 'Hair',
        variants: [
          ...generateVariants('short', 19),
          ...generateVariants('long', 26),
        ],
      },
      { id: 'glasses', label: 'Glasses', variants: generateVariants('variant', 5) },
      { id: 'earrings', label: 'Earrings', variants: generateVariants('variant', 6) },
    ],
  },
  {
    id: 'identicon',
    label: 'Identicon',
    description: 'Geometric cryptographic hash patterns',
    components: [],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    description: 'Abstract colorful geometric shapes',
    components: [],
  },
  {
    id: 'thumbs',
    label: 'Thumbs',
    description: 'Fun thumb person characters',
    components: [],
  },
  {
    id: 'adventurer-neutral',
    label: 'Adventurer Neutral',
    description: 'Minimal adventurer portraits by Lisa Wischofsky',
    components: [
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 26) },
      { id: 'mouth', label: 'Mouth', variants: generateVariants('variant', 30) },
      { id: 'eyebrows', label: 'Eyebrows', variants: generateVariants('variant', 15) },
      { id: 'glasses', label: 'Glasses', variants: generateVariants('variant', 5) },
    ],
  },
  {
    id: 'avataaars-neutral',
    label: 'Avataaars Neutral',
    description: 'Minimalist avataaars portraits by Pablo Stanley',
    components: [
      { id: 'eyes', label: 'Eyes', variants: ['closed', 'cry', 'default', 'dizzy', 'eyeRoll', 'happy', 'hearts', 'side', 'squint', 'surprised', 'wink', 'winkWacky'] },
      { id: 'mouth', label: 'Mouth', variants: ['concerned', 'default', 'disbelief', 'eating', 'grimace', 'sad', 'scream', 'serious', 'smile', 'tongue', 'twinkle', 'vomit'] },
      { id: 'eyebrows', label: 'Eyebrows', variants: ['angry', 'angryNatural', 'default', 'defaultNatural', 'flatNatural', 'frownNatural', 'raisedExcited', 'sadConcerned', 'upDown'] },
    ],
  },
  {
    id: 'big-ears',
    label: 'Big Ears',
    description: 'Quirky face avatars with pronounced ears by The Visual Team',
    components: [
      { id: 'face', label: 'Face', variants: generateVariants('variant', 9) },
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 7) },
      { id: 'mouth', label: 'Mouth', variants: generateVariants('variant', 12) },
      { id: 'hair', label: 'Hair', variants: generateVariants('variant', 33) },
    ],
  },
  {
    id: 'big-ears-neutral',
    label: 'Big Ears Neutral',
    description: 'Minimal quirky faces by The Visual Team',
    components: [
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 7) },
      { id: 'mouth', label: 'Mouth', variants: generateVariants('variant', 12) },
    ],
  },
  {
    id: 'big-smile',
    label: 'Big Smile',
    description: 'Joyful cartoon characters with huge smiles',
    components: [
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 16) },
      { id: 'mouth', label: 'Mouth', variants: generateVariants('variant', 20) },
      { id: 'hair', label: 'Hair', variants: generateVariants('variant', 24) },
    ],
  },
  {
    id: 'blobs',
    label: 'Blobs',
    description: 'Organic flowing liquid blob shapes',
    components: [],
  },
  {
    id: 'bottts-neutral',
    label: 'Bottts Neutral',
    description: 'Minimalist robot heads without background accessories',
    components: [
      { id: 'eyes', label: 'Eyes', variants: ['bulging', 'dizzy', 'eva', 'frame1', 'frame2', 'glow', 'happy', 'hearts', 'robocop', 'round', 'roundFrame01', 'roundFrame02', 'sensor', 'shade01'] },
      { id: 'mouth', label: 'Mouth', variants: ['bite', 'diagram', 'grill01', 'grill02', 'grill03', 'smile01', 'smile02', 'square01', 'square02'] },
    ],
  },
  {
    id: 'cameo',
    label: 'Cameo',
    description: 'Classic sculpted silhouette cameo portraits',
    components: [],
  },
  {
    id: 'clay',
    label: 'Clay',
    description: '3D claymorphic playful characters',
    components: [],
  },
  {
    id: 'constellation',
    label: 'Constellation',
    description: 'Starlight connected astronomy chart patterns',
    components: [],
  },
  {
    id: 'critters',
    label: 'Critters',
    description: 'Adorable creature critters with friendly faces',
    components: [],
  },
  {
    id: 'cutouts',
    label: 'Cutouts',
    description: 'Papercut collage style geometric portraits',
    components: [],
  },
  {
    id: 'disco',
    label: 'Disco',
    description: 'Retro 70s dance floor gradient patterns',
    components: [],
  },
  {
    id: 'dylan',
    label: 'Dylan',
    description: 'Handcrafted illustrated face avatars by Dylan',
    components: [],
  },
  {
    id: 'gaze',
    label: 'Gaze',
    description: 'Hypnotic animated geometric gaze artwork',
    components: [],
  },
  {
    id: 'glass',
    label: 'Glass',
    description: 'Frosted glassmorphic layered translucent icons',
    components: [],
  },
  {
    id: 'glyphs',
    label: 'Glyphs',
    description: 'Ancient futuristic symbolic vector glyphs',
    components: [],
  },
  {
    id: 'icons',
    label: 'Icons',
    description: 'Clean vector UI glyph avatars',
    components: [],
  },
  {
    id: 'initial-face',
    label: 'Initial Face',
    description: 'Letters cleverly transformed into cartoon faces',
    components: [],
  },
  {
    id: 'initials',
    label: 'Initials',
    description: 'Classic typography initials badges',
    components: [],
  },
  {
    id: 'landscape',
    label: 'Landscape',
    description: 'Scenic generative vector mountainscapes and horizons',
    components: [],
  },
  {
    id: 'line-face',
    label: 'Line Face',
    description: 'Continuous single-line minimal face drawings',
    components: [],
  },
  {
    id: 'loops',
    label: 'Loops',
    description: 'Infinite looping ribbon intertwining geometry',
    components: [],
  },
  {
    id: 'lorelei-neutral',
    label: 'Lorelei Neutral',
    description: 'Minimalist line art portraits by Lisa Wischofsky',
    components: [
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 24) },
      { id: 'mouth', label: 'Mouth', variants: [...generateVariants('happy', 18), ...generateVariants('sad', 9)] },
      { id: 'eyebrows', label: 'Eyebrows', variants: generateVariants('variant', 13) },
    ],
  },
  {
    id: 'marbles',
    label: 'Marbles',
    description: 'Swirling glass marble orb sphere artwork',
    components: [],
  },
  {
    id: 'micah',
    label: 'Micah',
    description: 'Clean contemporary avatar system by Micah Lanier',
    components: [
      { id: 'eyes', label: 'Eyes', variants: ['round', 'smiling', 'eyes', 'eyeshadow'] },
      { id: 'mouth', label: 'Mouth', variants: ['surprised', 'laughing', 'nervous', 'smile', 'sad', 'pucker', 'frown', 'smirk'] },
    ],
  },
  {
    id: 'miniavs',
    label: 'Miniavs',
    description: 'Charming mini comic avatar portraits',
    components: [],
  },
  {
    id: 'moods',
    label: 'Moods',
    description: 'Vibrant emotional abstract mood expressions',
    components: [],
  },
  {
    id: 'notionists-neutral',
    label: 'Notionists Neutral',
    description: 'Minimal notion-style doodle portraits',
    components: [
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 5) },
      { id: 'mouth', label: 'Mouth', variants: generateVariants('variant', 12) },
    ],
  },
  {
    id: 'open-peeps',
    label: 'Open Peeps',
    description: 'Hand-drawn illustration library by Pablo Stanley',
    components: [
      { id: 'face', label: 'Face', variants: generateVariants('variant', 10) },
      { id: 'head', label: 'Head & Hair', variants: generateVariants('variant', 20) },
    ],
  },
  {
    id: 'patchwork',
    label: 'Patchwork',
    description: 'Textured fabric patchwork vector collages',
    components: [],
  },
  {
    id: 'personas',
    label: 'Personas',
    description: 'Playful vector persona characters by Draftbit',
    components: [
      { id: 'eyes', label: 'Eyes', variants: ['open', 'wink'] },
      { id: 'mouth', label: 'Mouth', variants: ['bigSmile', 'smile', 'frown', 'surprise', 'pacifier'] },
    ],
  },
  {
    id: 'pixel-art-neutral',
    label: 'Pixel Art Neutral',
    description: 'Retro 8-bit arcade face sprites',
    components: [
      { id: 'eyes', label: 'Eyes', variants: generateVariants('variant', 16) },
      { id: 'mouth', label: 'Mouth', variants: generateVariants('variant', 16) },
    ],
  },
  {
    id: 'pixelbot',
    label: 'Pixelbot',
    description: 'Chunky 16-bit pixel robot sprites',
    components: [],
  },
  {
    id: 'planets',
    label: 'Planets',
    description: 'Cosmic celestial planets with rings and craters',
    components: [],
  },
  {
    id: 'rings',
    label: 'Rings',
    description: 'Radial concentric ring compositions',
    components: [],
  },
  {
    id: 'shadows',
    label: 'Shadows',
    description: 'Dramatic lighting and architectural shadow art',
    components: [],
  },
  {
    id: 'shape-grid',
    label: 'Shape Grid',
    description: 'Bauhaus style modular geometric grid system',
    components: [],
  },
  {
    id: 'slice',
    label: 'Slice',
    description: 'Diagonal sheared slice isometric designs',
    components: [],
  },
  {
    id: 'sprouts',
    label: 'Sprouts',
    description: 'Whimsical organic plant seedlings and botanicals',
    components: [],
  },
  {
    id: 'squircles',
    label: 'Squircles',
    description: 'Continuous superellipse curved tile arrangements',
    components: [],
  },
  {
    id: 'stack',
    label: 'Stack',
    description: 'Layered horizontal offset strata formations',
    components: [],
  },
  {
    id: 'stripes',
    label: 'Stripes',
    description: 'Bold op-art optical stripe patterns',
    components: [],
  },
  {
    id: 'toon-head',
    label: 'Toon Head',
    description: 'Classic Sunday morning cartoon character busts',
    components: [],
  },
  {
    id: 'triangles',
    label: 'Triangles',
    description: 'Tessellated low-poly crystalline prism patterns',
    components: [],
  },
  {
    id: 'voxel-art',
    label: 'Voxel Art',
    description: 'Isometric 3D voxel cube isometric figurines',
    components: [],
  },
  {
    id: 'voxel-bot',
    label: 'Voxel Bot',
    description: 'Voxelized robotic creatures in cubic dimension',
    components: [],
  },
  {
    id: 'waves',
    label: 'Waves',
    description: 'Mathematical harmonic wave interference gradients',
    components: [],
  },
  {
    id: 'weave',
    label: 'Weave',
    description: 'Interwoven diagonal lattice textile ribbons',
    components: [],
  },
];

export function getStyleDefinition(styleId: string): StyleDefinition {
  const found = DICEBEAR_STYLE_DEFINITIONS.find((s) => s.id === styleId);
  return found || DICEBEAR_STYLE_DEFINITIONS[0];
}

export function sanitizeExtraComponents(
  style: string,
  extra?: Record<string, string>
): Record<string, string> {
  if (!extra) return {};
  const def = getStyleDefinition(style);
  const sanitized: Record<string, string> = {};
  for (const comp of def.components) {
    const val = extra[comp.id];
    if (val && comp.variants.includes(val)) {
      sanitized[comp.id] = val;
    }
  }
  return sanitized;
}
