import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // The shared workspace is TypeScript source only, so it gets bundled in.
  noExternal: ['@bambu/shared'],
});
