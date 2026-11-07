/**
 * Mock duel state for the phone board mockup. Shaped like what the engine will report
 * (zones, positions, chain, prompts), but scripted: nothing here knows the real rules.
 * Every card is from Legend of Blue Eyes White Dragon; passcodes checked against YGOPRODeck.
 */

export const ID = {
    BLUE_EYES: 89631139,
    DARK_MAGICIAN: 46986414,
    MYSTICAL_ELF: 15025844,
    MAN_EATER_BUG: 54652250,
    CELTIC_GUARDIAN: 91152256,
    HITOTSU_ME_GIANT: 76184692,
    RED_EYES: 74677422,
    GAIA: 6368038,
    SILVER_FANG: 90357090,
    FISSURE: 66788016,
    MONSTER_REBORN: 83764718,
    DARK_HOLE: 53129443,
    RAIGEKI: 12580477,
    YAMI: 59197169,
    TRAP_HOLE: 4206964,
    DRAGON_CAPTURE_JAR: 50045299,
    REINFORCEMENTS: 17814387,
} as const;

export type Kind = "monster" | "spell" | "trap";
export type Info = { name: string; kind: Kind; atk?: number; def?: number; level?: number; race?: string };

export const INFO: Record<number, Info> = {
    [ID.BLUE_EYES]: { name: "Blue-Eyes White Dragon", kind: "monster", atk: 3000, def: 2500, level: 8, race: "Dragon" },
    [ID.DARK_MAGICIAN]: { name: "Dark Magician", kind: "monster", atk: 2500, def: 2100, level: 7, race: "Spellcaster" },
    [ID.MYSTICAL_ELF]: { name: "Mystical Elf", kind: "monster", atk: 800, def: 2000, level: 4, race: "Spellcaster" },
    [ID.MAN_EATER_BUG]: { name: "Man-Eater Bug", kind: "monster", atk: 450, def: 600, level: 2, race: "Insect" },
    [ID.CELTIC_GUARDIAN]: { name: "Celtic Guardian", kind: "monster", atk: 1400, def: 1200, level: 4, race: "Warrior" },
    [ID.HITOTSU_ME_GIANT]: { name: "Hitotsu-Me Giant", kind: "monster", atk: 1200, def: 1000, level: 4, race: "Beast-Warrior" },
    [ID.RED_EYES]: { name: "Red-Eyes Black Dragon", kind: "monster", atk: 2400, def: 2000, level: 7, race: "Dragon" },
    [ID.GAIA]: { name: "Gaia The Fierce Knight", kind: "monster", atk: 2300, def: 2100, level: 7, race: "Warrior" },
    [ID.SILVER_FANG]: { name: "Silver Fang", kind: "monster", atk: 1200, def: 800, level: 3, race: "Beast" },
    [ID.FISSURE]: { name: "Fissure", kind: "spell" },
    [ID.MONSTER_REBORN]: { name: "Monster Reborn", kind: "spell" },
    [ID.DARK_HOLE]: { name: "Dark Hole", kind: "spell" },
    [ID.RAIGEKI]: { name: "Raigeki", kind: "spell" },
    [ID.YAMI]: { name: "Yami", kind: "spell" },
    [ID.TRAP_HOLE]: { name: "Trap Hole", kind: "trap" },
    [ID.DRAGON_CAPTURE_JAR]: { name: "Dragon Capture Jar", kind: "trap" },
    [ID.REINFORCEMENTS]: { name: "Reinforcements", kind: "trap" },
};

const UNKNOWN: Info = { name: "Set card", kind: "spell" };
/** A card's facts, or a stand-in for a card the board doesn't know. */
export const infoOf = (id: number): Info => INFO[id] ?? UNKNOWN;

export type Who = "me" | "opp";
export type Pos = "atk" | "def";

/** One physical card in the duel. `uid` follows it from zone to zone (and drives the fly animation). */
export type Inst = { uid: string; id: number; face: "up" | "down"; pos: Pos; boost?: number; attacked?: boolean };

export type Side = {
    name: string;
    lp: number;
    hand: Inst[];
    monsters: (Inst | null)[];
    spells: (Inst | null)[];
    field: Inst | null;
    gy: Inst[];
    deck: number;
    extra: number;
};

export type Phase = "DP" | "SP" | "M1" | "BP" | "M2" | "EP";
export const PHASES: Phase[] = ["DP", "SP", "M1", "BP", "M2", "EP"];

export type ChainLink = { uid: string; id: number; owner: Who };
export type Float = { key: number; uid?: string; lp?: Who; text: string; tone: "up" | "down" };
export type Banner = { key: number; id: number; owner: Who; title: string; sub: string };

export type Duel = {
    me: Side;
    opp: Side;
    turn: number;
    phase: Phase;
    summoned: boolean;
    chain: ChainLink[];
    banner: Banner | null;
    floats: Float[];
    destroying: string[];
};

let n = 0;
const card = (id: number, face: "up" | "down" = "up", pos: Pos = "atk"): Inst => ({ uid: `c${++n}`, id, face, pos });

export function initialDuel(): Duel {
    n = 0;
    return {
        turn: 3,
        phase: "M1",
        summoned: false,
        chain: [],
        banner: null,
        floats: [],
        destroying: [],
        me: {
            name: "You",
            lp: 8000,
            hand: [card(ID.CELTIC_GUARDIAN), card(ID.DARK_MAGICIAN), card(ID.FISSURE), card(ID.MONSTER_REBORN), card(ID.TRAP_HOLE)],
            monsters: [null, card(ID.BLUE_EYES), card(ID.MYSTICAL_ELF, "up", "def"), card(ID.MAN_EATER_BUG, "down", "def"), null],
            spells: [null, card(ID.DRAGON_CAPTURE_JAR, "down"), card(ID.REINFORCEMENTS, "down"), null, null],
            field: null,
            gy: [card(ID.HITOTSU_ME_GIANT), card(ID.DARK_HOLE)],
            deck: 30,
            extra: 0,
        },
        opp: {
            name: "Rival",
            lp: 8000,
            hand: [card(0, "down"), card(0, "down"), card(0, "down")],
            // Zone 0 is the owner's leftmost; the board draws the rival's rows mirrored.
            monsters: [null, card(ID.RED_EYES), null, card(ID.GAIA), null],
            spells: [null, card(ID.TRAP_HOLE, "down"), null, card(ID.REINFORCEMENTS, "down"), null],
            field: card(ID.YAMI),
            gy: [card(ID.SILVER_FANG), card(ID.RAIGEKI)],
            deck: 31,
            extra: 0,
        },
    };
}

/** ATK/DEF as they stand now: Yami (+200 Fiend and Spellcaster, −200 Fairy) and any boost. */
export function statsOf(d: Duel, c: Inst) {
    const i = infoOf(c.id);
    let atk = i.atk ?? 0, def = i.def ?? 0;
    const yami = [d.me.field, d.opp.field].some((f) => f?.id === ID.YAMI && f.face === "up");
    const shift = !yami ? 0 : i.race === "Spellcaster" || i.race === "Fiend" ? 200 : i.race === "Fairy" ? -200 : 0;
    atk += shift;
    def += shift;
    atk += c.boost ?? 0;
    return { atk, def, atkDelta: atk - (i.atk ?? 0), defDelta: def - (i.def ?? 0) };
}

export type Where = { who: Who; zone: "hand" | "monsters" | "spells" | "field" | "gy"; index: number };

export function locate(d: Duel, uid: string): (Where & { card: Inst }) | null {
    for (const who of ["me", "opp"] as const) {
        const s = d[who];
        for (const zone of ["hand", "monsters", "spells", "gy"] as const) {
            const index = s[zone].findIndex((c) => c?.uid === uid);
            if (index >= 0) return { who, zone, index, card: s[zone][index]! };
        }
        if (s.field?.uid === uid) return { who, zone: "field", index: 0, card: s.field };
    }
    return null;
}

/** Takes a card out of wherever it is. */
export function lift(d: Duel, uid: string): Inst | null {
    const at = locate(d, uid);
    if (!at) return null;
    const s = d[at.who];
    if (at.zone === "hand" || at.zone === "gy") s[at.zone].splice(at.index, 1);
    else if (at.zone === "field") s.field = null;
    else s[at.zone][at.index] = null;
    return at.card;
}

/** The free zone nearest the middle, as most players place cards. */
export const freeZone = (row: (Inst | null)[]) => [2, 1, 3, 0, 4].find((i) => !row[i]) ?? -1;
