/* Media compression with ffmpeg. Run from the project root after adding files:
       npm run media
   - GIFs  -> MP4 (H.264, max 1280px, crf 22) — animations belong in video.
   - PNG/JPG -> AVIF (downscale to max 2560px, alpha flattened onto white,
     libaom-av1 still-picture, crf 28). AVIF is read by all current browsers
     and the gallery uses the file directly via <img src>.
   Replaces originals in place (keep your master files elsewhere). Per file it
   writes the new file, checks it, then removes the source — a locked/failed
   file is skipped and reported, never lost. A file whose converted name is
   already taken (x.png next to x.jpg or x.avif) is skipped, never overwritten.
*/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Every category folder under src/work is processed.
const WORK = path.join(ROOT, 'src', 'work');
const MACROS = fs.readdirSync(WORK, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(WORK, e.name));
const VIDEO_W = 1280;
const IMG_DIM = 2560;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function ff(args) { execFileSync('ffmpeg', ['-y', '-loglevel', 'error'].concat(args), { stdio: ['ignore', 'ignore', 'inherit'] }); }
const mb = b => (b / 1048576).toFixed(0);

const fails = [];
let gif = 0, img = 0, before = 0, after = 0, done = 0;
const files = MACROS.filter(d => fs.existsSync(d)).flatMap(d => walk(d));
const total = files.filter(f => /\.(gif|png|jpe?g)$/i.test(f)).length;

for (const f of files) {
  const ext = path.extname(f).toLowerCase();
  let sz; try { sz = fs.statSync(f).size; } catch { continue; }

  if (ext === '.gif') {
    const out = f.slice(0, -4) + '.mp4';
    if (fs.existsSync(out)) { fails.push('SKIPPED (an .mp4 with this name exists) ' + path.relative(ROOT, f)); continue; }
    try {
      ff(['-i', f, '-movflags', '+faststart', '-pix_fmt', 'yuv420p',
        '-vf', `scale='min(${VIDEO_W},iw)':-2:flags=lanczos`, '-c:v', 'libx264', '-crf', '22', '-an', out]);
      if (fs.statSync(out).size > 0) { fs.unlinkSync(f); gif++; before += sz; after += fs.statSync(out).size; }
    } catch (e) { fails.push('GIF ' + path.relative(ROOT, f)); try { fs.unlinkSync(out); } catch {} }
  } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
    const out = f.slice(0, -ext.length) + '.avif';
    const tmp = f + '.__tmp.avif';
    // x.png and x.jpg would both become x.avif: never overwrite, keep the source.
    if (fs.existsSync(out)) { fails.push('SKIPPED (an .avif with this name exists) ' + path.relative(ROOT, f)); continue; }
    try {
      ff(['-i', f, '-filter_complex',
        `[0]scale='min(${IMG_DIM},iw)':-2:flags=lanczos,format=rgba[fg];color=c=white[bg];[bg][fg]scale2ref[bg2][fg2];[bg2][fg2]overlay=shortest=1,format=yuv420p`,
        '-c:v', 'libaom-av1', '-still-picture', '1', '-crf', '28', '-b:v', '0', '-cpu-used', '6', tmp]);
      if (fs.statSync(tmp).size > 0) {
        const osz = fs.statSync(tmp).size;
        fs.unlinkSync(f);
        fs.renameSync(tmp, out);
        img++; before += sz; after += osz;
      }
    } catch (e) { fails.push('IMG ' + path.relative(ROOT, f)); try { fs.unlinkSync(tmp); } catch {} }
  } else continue;

  done++;
  if (done % 15 === 0) console.log(`  ${done}/${total} …`);
}

console.log(`\nDone. gifs->mp4: ${gif}, images->avif: ${img}, failures: ${fails.length}`);
console.log(`size: ${mb(before)}MB -> ${mb(after)}MB`);
if (fails.length) { console.log('NOT CONVERTED (locked files: close the app and re-run; name clashes: rename one):'); fails.forEach(x => console.log('  ' + x)); }
