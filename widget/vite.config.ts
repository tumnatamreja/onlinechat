import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/widget.ts',
      name: 'GhostLineWidget',
      formats: ['iife'],
      fileName: () => 'ghostline-widget.js',
    },
    outDir: 'dist',
    minify: 'esbuild',
  },
});
