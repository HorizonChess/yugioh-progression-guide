import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    // @ygo/shared ships TypeScript source, so bundle it in; npm packages stay external.
    noExternal: ['@ygo/shared'],
});
