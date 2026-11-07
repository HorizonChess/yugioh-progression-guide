// Builds shared/src/duel/card-versions.json: the older versions of cards a duel may play, with the
// text they had and until when, from the engine data (npm run fetch-engine) and the reviewed
// errata dates in shared/src/duel/errata-dates.ts. Run after either changes:
//
//   npx tsx api/scripts/build-card-versions.ts
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ERRATA_DATES, GOAT_UNTIL } from '../../shared/src/duel/errata-dates';
import type { CardVersion } from '../../shared/src/duel/versions';

interface Row { alias: number; name: string; version?: 'goat' | 'pre-errata'; desc?: string }
const root = path.resolve(import.meta.dirname, '..');
const cards = JSON.parse(readFileSync(path.join(root, 'engine-data/cards.json'), 'utf-8')) as Record<string, Row>;

const out: CardVersion[] = [];
for (const [code, row] of Object.entries(cards)) {
    if (!row.version) continue;
    const name = cards[String(row.alias)]?.name;
    if (!name) continue;
    if (row.version === 'goat') {
        out.push({ name, kind: 'goat', code: Number(code), base: row.alias, until: GOAT_UNTIL, text: row.desc ?? '', source: 'GOAT format (TCG, April to September 2005)' });
        continue;
    }
    const errata = ERRATA_DATES[name];
    if (!errata) continue;
    out.push({ name, kind: 'pre-errata', code: Number(code), base: row.alias, until: errata.until, text: row.desc ?? '', source: `Errata first printed on ${errata.source}` });
}
out.sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
writeFileSync(path.join(root, '../shared/src/duel/card-versions.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`${out.length} versions: ${out.filter((v) => v.kind === 'goat').length} GOAT, ${out.filter((v) => v.kind === 'pre-errata').length} pre-errata`);
const missing = Object.keys(ERRATA_DATES).filter((n) => !out.some((v) => v.name === n && v.kind === 'pre-errata'));
if (missing.length) console.warn('Reviewed but not found in the engine data:', missing.join(', '));
