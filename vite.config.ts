import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the bundle path-independent so it works under
// any GitHub Pages subpath (e.g. /breaker-panel-builder/).
export default defineConfig({
  base: './',
  plugins: [react()],
});
