import type { OcgCardData, OcgCoreSync } from 'ocgcore-wasm';

/*
 * EDOPro's rules engine (ocgcore, AGPL-3.0) as WebAssembly, with the card scripts, card data and
 * system strings it plays from. Where they come from is the caller's business: the server reads
 * them from api/engine-data, a browser (the bot thinking on the player's device) fetches them.
 * One engine serves every duel: the WASM core is synchronous, so duels never run at the same instant.
 */

/** A card's row in cards.json. */
export interface CardRow {
    alias: number;
    setcode: string;
    type: number;
    atk: number;
    def: number;
    level: number;
    race: string;
    attribute: number;
    name: string;
    strs: string[];
}

export interface EngineData {
    core: OcgCoreSync;
    /** Starts a new WASM core (after a fault, see `engineFaulted`). */
    newCore: () => Promise<OcgCoreSync>;
    /** The pinned commits the data came from (version.json as it is). */
    version: string;
    rows: Record<string, CardRow>;
    strings: { system: Record<string, string>; victory: Record<string, string> };
    /**
     * A script by its plain name: a library (utility.lua) or a card's (c12345.lua), or null when
     * there's none (Normal Monsters have no script; the engine asks anyway).
     */
    readFile: (name: string) => string | null;
}

export interface Engine {
    core: OcgCoreSync;
    /**
     * Starts a new WASM core in place of this one. After the core faults (see `engineFaulted`) it
     * is unusable for every duel, so the duels in memory are dropped and rebuilt on the new core.
     */
    revive(): Promise<void>;
    /** The pinned commits the data came from, stored with each duel (a replay needs the same ones). */
    version: string;
    cardData(code: number): OcgCardData | null;
    readScript(name: string): string | null;
    name(code: number): string;
    /** The text of an effect description id: a card's own string, or a system string. */
    describe(description: bigint | number): string;
    victoryReason(reason: number): string;
    /** A card's passcode by its exact name (case ignored), for "declare a card name". */
    codeByName(name: string): number | null;
    isMonster(code: number): boolean;
    /** A card that goes in the Extra Deck (Fusion, Synchro, Xyz, Link). */
    isExtra(code: number): boolean;
    /**
     * Teaches the engine a passcode it doesn't have, by the card's name: YGOPRODeck lists a few
     * cards under an alternate-art passcode (Barrel Dragon's 81480461) that EDOPro doesn't use.
     * False if no card of that name exists here (video-game prize cards).
     */
    learn(code: number, name: string): boolean;
    /** Teaches a passcode the engine's own code for the card (what `learn` worked out, elsewhere). */
    learnAs(code: number, base: number): void;
    /** The passcodes learned among these: code → the engine's own code. */
    learnedOf(codes: readonly number[]): Record<string, number>;
    baseAttack(code: number): number;
    /** A monster's Level (0 for anything else). */
    level(code: number): number;
    /**
     * Roughly what a card's effect does, read from its script (for the practice bot): `buff` raises
     * a monster's ATK/DEF or equips it, `wipe` destroys or removes monsters on both sides at once.
     */
    effectKind(code: number): 'buff' | 'wipe' | 'other';
    /**
     * Whether a card's script holds an effect that must happen in a phase (an upkeep, "during each
     * Standby Phase: ..."), as far as its script shows. False only when the script has phase or
     * free-timing effects and every one of them is optional ("you can").
     */
    mandatoryInPhase(code: number): boolean;
    /**
     * Whether a card can be activated in answer to something happening (Michizure: a monster of
     * yours sent to the Graveyard; Trap Hole: a summon), as far as its script shows. Such a card
     * can only be used at that moment, unlike one usable at any time.
     */
    answersEvents(code: number): boolean;
    /** A Continuous Trap (it stays on the field once flipped). */
    isContinuousTrap(code: number): boolean;
    /** A token (Sheep Token, Ojama Token): made by an effect, never in a deck. */
    isToken(code: number): boolean;
}

const TYPE_MONSTER = 0x1;
const TYPE_TRAP = 0x4;
const TYPE_CONTINUOUS = 0x20000;
const TYPE_TOKEN = 0x4000;
const TYPE_LINK = 0x4000000;
/** Fusion, Synchro, Xyz and Link monsters. */
const TYPE_EXTRA = 0x40 | 0x2000 | 0x800000 | TYPE_LINK;

/**
 * Whether an error is the WASM core itself failing (not a rule or a script error, which the core
 * reports and survives). Seen with two Double Spells, one in each Graveyard: each checks whether
 * the other could be activated, without end, and the core's stack runs out. The fault leaves the
 * core broken for every duel on it.
 */
export const engineFaulted = (error: unknown): boolean => error instanceof WebAssembly.RuntimeError || (error instanceof RangeError && /call stack/i.test(error.message));

export function createEngine(source: EngineData): Engine {
    const { rows, strings } = source;
    const byName = new Map<string, number>();
    for (const [code, row] of Object.entries(rows)) if (!row.alias) byName.set(row.name.toLowerCase(), Number(code));

    const data = new Map<number, OcgCardData>();
    const scripts = new Map<string, string | null>();
    /** Passcodes learned from their names: code → the engine's own code for that card. */
    const learned = new Map<number, number>();
    const row = (code: number) => rows[String(code)];

    const engine: Engine = {
        core: source.core,
        version: source.version,
        async revive() {
            engine.core = await source.newCore();
        },
        cardData(code) {
            const cached = data.get(code);
            if (cached) return cached;
            const base = learned.get(code);
            if (base) {
                const card = { ...engine.cardData(base)!, code, alias: base };
                data.set(code, card);
                return card;
            }
            const r = row(code);
            if (!r) return null;
            const set = BigInt(r.setcode);
            const link = (r.type & TYPE_LINK) !== 0;
            const card: OcgCardData = {
                code, alias: r.alias,
                setcodes: [0n, 16n, 32n, 48n].map((s) => Number((set >> s) & 0xffffn)).filter(Boolean),
                type: r.type, level: r.level & 0xff, lscale: (r.level >> 24) & 0xff, rscale: (r.level >> 16) & 0xff,
                attribute: r.attribute, race: BigInt(r.race), attack: r.atk,
                defense: link ? 0 : r.def, link_marker: link ? r.def : 0,
            };
            data.set(code, card);
            return card;
        },
        readScript(name) {
            if (scripts.has(name)) return scripts.get(name)!;
            // Only plain script names: never a path out of the scripts folder.
            if (!/^[\w.-]+\.lua$/.test(name)) return null;
            // A learned passcode plays its card's script.
            const alt = /^c(\d+)\.lua$/.exec(name);
            const base = alt && learned.get(Number(alt[1]));
            if (base) return engine.readScript(`c${base}.lua`);
            const text = source.readFile(name);
            scripts.set(name, text);
            return text;
        },
        name: (code) => row(learned.get(code) ?? code)?.name ?? `Card ${code}`,
        describe(description) {
            const d = BigInt(description);
            const code = Number(d >> 20n), index = Number(d & 0xfffffn);
            if (code) return row(code)?.strs[index] || `${row(code)?.name ?? 'Card'}: use this effect`;
            return strings.system[String(index)] ?? '';
        },
        victoryReason: (reason) => strings.victory[String(reason)] ?? 'The duel is over',
        codeByName: (name) => byName.get(name.trim().toLowerCase()) ?? null,
        isMonster: (code) => ((row(code)?.type ?? 0) & TYPE_MONSTER) !== 0,
        isExtra: (code) => ((row(learned.get(code) ?? code)?.type ?? 0) & TYPE_EXTRA) !== 0,
        isToken: (code) => ((row(code)?.type ?? 0) & TYPE_TOKEN) !== 0,
        isContinuousTrap: (code) => ((row(learned.get(code) ?? code)?.type ?? 0) & (TYPE_TRAP | TYPE_CONTINUOUS)) === (TYPE_TRAP | TYPE_CONTINUOUS),
        learn(code, name) {
            if (row(code) || learned.has(code)) return true;
            const base = byName.get(name.trim().toLowerCase());
            if (!base) return false;
            learned.set(code, base);
            return true;
        },
        learnAs(code, base) {
            if (!row(code) && row(base)) learned.set(code, base);
        },
        learnedOf(codes) {
            const out: Record<string, number> = {};
            for (const c of codes) {
                const base = learned.get(c);
                if (base) out[String(c)] = base;
            }
            return out;
        },
        baseAttack: (code) => row(code)?.atk ?? 0,
        level: (code) => row(code)?.level ?? 0,
        mandatoryInPhase(code) {
            const script = engine.readScript(`c${learned.get(code) ?? code}.lua`);
            // Effects a library registers (a Spirit monster's return to the hand) aren't in the card's own script.
            if (!script || /Spirit\.|aux\.\w*(Maintenance|Spirit)/.test(script)) return true;
            // One chunk per effect the script creates: its type and the event it waits for.
            const effects = script.split(/Effect\.CreateEffect\(/).slice(1);
            const timed = effects.filter((e) => /SetCode\(\s*EVENT_(PHASE|FREE_CHAIN)/.test(e));
            const must = (e: string) => /SetCode\(\s*EVENT_PHASE/.test(e) && /SetType\([^)]*(TRIGGER_F|CONTINUOUS)/.test(e);
            return !timed.length || timed.some(must);
        },
        answersEvents(code) {
            const script = engine.readScript(`c${learned.get(code) ?? code}.lua`) ?? '';
            return script.split(/Effect\.CreateEffect\(/).slice(1).some((e) => /SetType\([^)]*EFFECT_TYPE_(ACTIVATE|QUICK_[OF])/.test(e) && /SetCode\(\s*EVENT_(?!FREE_CHAIN)/.test(e));
        },
        effectKind(code) {
            const script = engine.readScript(`c${learned.get(code) ?? code}.lua`) ?? '';
            const harms = /CATEGORY_(DESTROY|REMOVE|TOGRAVE|TOHAND|TODECK|DISABLE|NEGATE|CONTROL|DAMAGE)/.test(script);
            if (harms && /GetMatchingGroup\([^)]*LOCATION_MZONE,LOCATION_MZONE/.test(script)) return 'wipe';
            if (!harms && (/CATEGORY_(ATKCHANGE|DEFCHANGE)/.test(script) || /AddEquipProcedure/.test(script))) return 'buff';
            return 'other';
        },
    };
    return engine;
}
