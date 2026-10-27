import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = await buildApp({ config });

// Render sends SIGTERM on deploys; finish in-flight requests and close Mongo.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        app.close().then(
            () => process.exit(0),
            () => process.exit(1),
        );
    });
}

await app.listen({ host: config.HOST, port: config.PORT });
