import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Next 16's static export writes a route's segment prefetch payloads into a
 * folder (`menu/__next.menu/__PAGE__.txt`), but the client router requests them
 * with dots (`menu/__next.menu.__PAGE__.txt`). Without this rewrite every
 * client-side navigation 404s its prefetch and falls back to a full page load.
 *
 * Returns a `rewriteUrl` for Fastify that maps the dotted name onto the file
 * that exists, leaving every other URL untouched.
 */
export function nextSegmentRewrite(webDist: string): (url: string) => string {
    const root = path.resolve(webDist);

    return (url) => {
        const queryStart = url.indexOf('?');
        const pathname = queryStart === -1 ? url : url.slice(0, queryStart);
        const query = queryStart === -1 ? '' : url.slice(queryStart);

        const match = /^(.*\/)__next\.([^/]+)\.txt$/.exec(pathname);
        if (!match) return url;
        const [, dir = '/', segments = ''] = match;
        const [first, ...rest] = segments.split('.');
        if (!first || rest.length === 0) return url;

        const fileFor = (urlPath: string) => {
            const file = path.resolve(root, `.${decodeURIComponent(urlPath)}`);
            return file.startsWith(root + path.sep) ? file : null;
        };
        const requested = fileFor(pathname);
        if (requested && existsSync(requested)) return url;

        const nested = `${dir}__next.${first}/${rest.join('/')}.txt`;
        const nestedFile = fileFor(nested);
        return nestedFile && existsSync(nestedFile) ? nested + query : url;
    };
}
