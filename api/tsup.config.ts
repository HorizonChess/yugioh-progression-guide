import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    // @ygo/shared and @ygo/duel ship TypeScript source, so bundle them in; npm packages stay external.
    noExternal: ['@ygo/shared', '@ygo/duel'],
});
