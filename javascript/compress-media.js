/* One-time media compression with ffmpeg. Run from project root:
       node javascript/compress-media.js
   - GIFs  -> MP4 (H.264, max 1280px, crf 22) — animations belong in video.
   - PNG/JPG -> JPG (downscale to max 2560px, alpha flattened onto white, q3).
   Replaces originals in place (keep your master files elsewhere). Per file it
   writes the new file, checks it, then removes the source — a locked/failed
   file is skipped and reported, never lost.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MACROS = ['VISUAL DEVELOPMENT', 'ILLUSTRATION', 'ANIMATION'].map(d => path.join(ROOT, 'images', d));
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
    try {
      ff(['-i', f, '-movflags', '+faststart', '-pix_fmt', 'yuv420p',
        '-vf', `scale='min(${VIDEO_W},iw)':-2:flags=lanczos`, '-c:v', 'libx264', '-crf', '22', '-an', out]);
      if (fs.statSync(out).size > 0) { fs.unlinkSync(f); gif++; before += sz; after += fs.statSync(out).size; }
    } catch (e) { fails.push('GIF ' + path.relative(ROOT, f)); try { fs.unlinkSync(out); } catch {} }
  } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
    const out = f.slice(0, -ext.length) + '.jpg';
    const tmp = f + '.__tmp.jpg';
    try {
      ff(['-i', f, '-filter_complex',
        `[0]scale='min(${IMG_DIM},iw)':-2:flags=lanczos,format=rgba[fg];color=c=white[bg];[bg][fg]scale2ref[bg2][fg2];[bg2][fg2]overlay=shortest=1,format=yuvj420p`,
        '-q:v', '3', tmp]);
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

console.log(`\nDone. gifs->mp4: ${gif}, images->jpg: ${img}, failures: ${fails.length}`);
console.log(`size: ${mb(before)}MB -> ${mb(after)}MB`);
if (fails.length) { console.log('FAILED (locked? re-run after closing the app):'); fails.forEach(x => console.log('  ' + x)); }
