import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE is set by the GitHub Pages workflow to "/<repo>/". Local dev uses "/".
export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [react()],
});
