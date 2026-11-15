// Dev server for real-GPU captures of the working fixture. Private cache dir so the
// shared repo's node_modules/.vite is never touched by this worker.
// (config is plain: vite is resolved from tools/runtime/node_modules)
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const BASE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export default ({
  // Served from a frozen snapshot of the fixture (capture.sh), so edits made while a capture runs cannot reload the page.
  root: process.env.KZ_ROOT ?? resolve(BASE, '../..'),
  base: './',
  cacheDir: resolve(BASE, '.vite-cache'),
  server: { port: Number(process.env.KZ_PORT ?? 5199), host: '127.0.0.1', strictPort: true, hmr: false, watch: null, fs: { allow: [resolve(BASE, '../..')] } },
});
