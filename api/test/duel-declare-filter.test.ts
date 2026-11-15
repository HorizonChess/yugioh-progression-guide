import { describe, expect, it } from 'vitest';
import { declarable, declarableCard } from '@ygo/duel/declare';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';

// The engine's filter for "declare a card name" (ANNOUNCE_CARD's opcodes): the bot must only name
// cards it allows, or the engine refuses the answer and the duel stops.
const ISTYPE = 0x4000010200000000n, ISCODE = 0x4000010000000000n, NOT = 0x4000000700000000n, AND = 0x4000000400000000n, ALLOW_TOKENS = 0x4000001500000000n;
const TYPE_MONSTER = 0x1n, TYPE_SPELL = 0x2n;
const POT_OF_GREED = 55144522, DARK_MAGICIAN = 46986414, SHEEP_TOKEN = 73915052, ACID_TRAP_HOLE = 41356845;

describe.skipIf(!engineDataAvailable())('the bot declaring a card', () => {
    it('reads the filter as ocgcore does', async () => {
        const engine = await loadEngine();
        const monster = [TYPE_MONSTER, ISTYPE];
        expect(declarable(engine, DARK_MAGICIAN, monster)).toBe(true);
        expect(declarable(engine, POT_OF_GREED, monster)).toBe(false);
        // "Not a Spell, and not Dark Magician".
        const notSpellNorDm = [TYPE_SPELL, ISTYPE, NOT, BigInt(DARK_MAGICIAN), ISCODE, NOT, AND];
        expect(declarable(engine, DARK_MAGICIAN, notSpellNorDm)).toBe(false);
        expect(declarable(engine, POT_OF_GREED, notSpellNorDm)).toBe(false);
        expect(declarable(engine, ACID_TRAP_HOLE, notSpellNorDm)).toBe(true);
        // Tokens only when the filter allows them.
        expect(declarable(engine, SHEEP_TOKEN, [1n])).toBe(false);
        expect(declarable(engine, SHEEP_TOKEN, [1n, ALLOW_TOKENS])).toBe(true);
    });

    it('names a card the rival showed if it fits, else another that does', async () => {
        const engine = await loadEngine();
        expect(declarableCard(engine, [1n], [POT_OF_GREED])).toBe(POT_OF_GREED);
        const pick = declarableCard(engine, [TYPE_MONSTER, ISTYPE], [POT_OF_GREED]);
        expect(pick).not.toBe(POT_OF_GREED);
        expect(declarable(engine, pick!, [TYPE_MONSTER, ISTYPE])).toBe(true);
    });
});
