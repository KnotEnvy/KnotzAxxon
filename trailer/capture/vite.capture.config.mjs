// Dev server for trailer captures: the game's own config, minus file watching
// and HMR, so editing trailer files can never reload a page mid-shot.
import base from '../../vite.config.js';
export default {
  ...base,
  root: new URL('../../', import.meta.url).pathname,
  server: { ...base.server, port: 5190, strictPort: true, host: '127.0.0.1', hmr: false, watch: { ignored: ['**/*'] } },
};
