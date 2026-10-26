import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        // The first run downloads a MongoDB binary for mongodb-memory-server.
        hookTimeout: 180_000,
        testTimeout: 30_000,
    },
});
