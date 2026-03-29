/**
 * Regenerates src/app/data/data-svg-strings.ts from the SVG files in src/app/data/.
 * Run: npm run embed:data-svgs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dir = path.join(root, 'src/app/data');
const outFile = path.join(dir, 'data-svg-strings.ts');

const entries = [
  { key: 'photoNgMobileSvg', file: '201806_photoNG_mobile.svg' },
  { key: 'brocSvg', file: 'broc.svg' },
  { key: 'docIcoSvg', file: 'Doc_ico.svg' },
  { key: 'familyEatingClipArtSvg', file: 'Family_eating_clip_art.svg' },
  { key: 'lemonSqueezeSvg', file: 'lemon-squeeze.svg' },
  { key: 'svgFutureSvg', file: 'svg-future.svg' }
];

let out =
  '/**\n * Bundled SVG markup from sibling `.svg` files (see `tools/embed-data-svgs.mjs`).\n */\n';
for (const { key, file } of entries) {
  const s = fs.readFileSync(path.join(dir, file), 'utf8');
  out += `export const ${key}: string = ${JSON.stringify(s)};\n`;
}
fs.writeFileSync(outFile, out);
console.log('Wrote', outFile);
