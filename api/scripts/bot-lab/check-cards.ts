import { loadEngine } from '../../src/duel/engine';
import { CARDS } from './decks';
const engine = await loadEngine();
for (const [k, code] of Object.entries(CARDS)) {
    const name = engine.name(code);
    const script = engine.readScript(`c${code}.lua`);
    console.log(k.padEnd(20), code, name, engine.isMonster(code) ? '' : (script ? 'script' : 'NO SCRIPT'));
}
