// Сборка: TypeScript -> один самодостаточный HTML (работает офлайн, в браузере телефона и ПК,
// годится для упаковки в Capacitor / Tauri / Electron).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const root = path.dirname(new URL(import.meta.url).pathname);
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });

async function buildGame() {
  const res = await esbuild.build({
    entryPoints: [path.join(root, 'src/main.ts')],
    bundle: true, minify: !args.has('--watch'), format: 'iife', target: 'es2020', write: false,
  });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = fs.readFileSync(path.join(root, 'src/ui/styles.css'), 'utf8');
  const body = fs.readFileSync(path.join(root, 'src/ui/body.html'), 'utf8');
  const head = `<title>Эпохи</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#0e141e">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Forum&family=Golos+Text:wght@400;500;600;700&display=swap">
<style>${css}</style>`;
  const fragment = `${head}\n${body}\n<script>${js}</script>\n`;
  // artifact.html — фрагмент для публикации (скелет добавляется хостингом)
  fs.writeFileSync(path.join(dist, 'artifact.html'), fragment);
  // index.html — полноценная страница для браузера / Capacitor / Tauri
  fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
${head}</head><body>
${body}
<script>${js}</script>
</body></html>
`);
  const kb = (fs.statSync(path.join(dist, 'index.html')).size / 1024).toFixed(0);
  console.log(`[build] dist/index.html (${kb} KB), dist/artifact.html`);
}

async function buildSim() {
  await esbuild.build({
    entryPoints: [path.join(root, 'tools/sim.ts')],
    bundle: true, platform: 'node', format: 'cjs', target: 'node18',
    outfile: path.join(dist, 'sim.cjs'),
  });
}

if (args.has('--sim')) { await buildSim(); process.exit(0); }
await buildGame();

if (args.has('--watch')) {
  let timer = null;
  fs.watch(path.join(root, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => buildGame().catch(e => console.error(e.message)), 120);
  });
  console.log('[watch] слежу за src/ ...');
}
if (args.has('--serve')) {
  const http = await import('node:http');
  http.createServer((req, res) => {
    const file = path.join(dist, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!file.startsWith(dist) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(5173, '0.0.0.0', () => console.log('[serve] http://localhost:5173  (с телефона в той же сети: http://<IP-компьютера>:5173)'));
}
