import type { BotLevel } from './protocol';
import decks from './duelist-decks.json';

/**
 * The duelists you can practice against, in the manner of chess.com's bots: each from the anime,
 * with a sprite, a strength of their own (the bot's level, shown as a rating) and the deck they
 * played in an era of the show. The decks are as fans rebuilt them on YGOPRODeck ("Anime Decks"),
 * from cards printed before the progression's cutoff: anime cards were mostly printed years later,
 * so a duelist plays their deck whatever set the series has reached.
 *
 * Some eras also have a competitive build of the duelist's theme, as the real game played it
 * around then (2002's Yugi-Kaiba format for Duelist Kingdom, 2005's Goat format for Battle City,
 * 2016's meta for The Dark Side of Dimensions): chosen as the era's id with a `+` (`bc+`).
 *
 * The lists are fetched and checked by `api/scripts/build-duelists.ts` into duelist-decks.json.
 */

/** Where a list comes from: a YGOPRODeck deck, found by its name and number (in its format: Anime Decks unless said). */
export interface DeckSource { deckNum: number; name: string; author: string; format?: string }

export interface DuelistEra {
    /** Key within the duelist (`dk`, `bc`, ...). */
    id: string;
    label: string;
    source: DeckSource;
    /** A competitive build of their theme, as played in the real game around the era; `played`: when and how ("Goat format, 2005"). */
    competitive?: DeckSource & { played: string };
}

export interface Duelist {
    id: string;
    name: string;
    /** The sprite under /sprites/. */
    sprite: string;
    /** For show, chess.com style; the level is what decides how it plays. */
    rating: number;
    level: BotLevel;
    /** One line about how they duel. */
    blurb: string;
    eras: DuelistEra[];
}

const DK = 'Duelist Kingdom', BC = 'Battle City', WTD = 'Waking the Dragons', VW = 'Virtual World', CD = 'Ceremonial Duel', DSOD = 'Dark Side of Dimensions';
const era = (id: string, label: string, deckNum: number, name: string, author: string, competitive?: DuelistEra['competitive']): DuelistEra => ({ id, label, source: { deckNum, name, author }, ...(competitive ? { competitive } : {}) });
const META = 'Meta Decks', GOAT = 'Goat Format Decks';
const comp = (deckNum: number, name: string, author: string, format: string, played: string): DuelistEra['competitive'] => ({ deckNum, name, author, format, played });

/** Weakest first. */
export const DUELISTS: readonly Duelist[] = [
    {
        id: 'serenity', name: 'Serenity Wheeler', sprite: 'serenity_neutral_transparent', rating: 400, level: 'easy',
        blurb: 'Gentle fairies and witches, and St. Joan when it counts.',
        eras: [era('vw', VW, 107274, "Serenity Wheeler's character deck", 'zcgreenprofile')],
    },
    {
        id: 'tea', name: 'Téa Gardner', sprite: 'tea_neutral_transparent', rating: 450, level: 'easy',
        blurb: 'Fairies and friendship: she wins by holding on.',
        eras: [era('bc', BC, 335327, 'Téa Gardner Deck', 'LC Playmaker')],
    },
    {
        id: 'tristan', name: 'Tristan Taylor', sprite: 'tristan_neutral_transparent', rating: 500, level: 'easy',
        blurb: 'Robolady, Roboyarou and a lot of heart.',
        eras: [era('vw', VW, 106974, "Tristan Taylor's character deck (Virtual World version)", 'zcgreenprofile')],
    },
    {
        id: 'mokuba', name: 'Mokuba Kaiba', sprite: 'mokuba_neutral_transparent', rating: 600, level: 'easy',
        blurb: 'Dueling the way his big brother taught him.',
        eras: [era('dk', DK, 700890, 'Duelist Kingdom - Mokuba Kaiba', 'WormPrince')],
    },
    {
        id: 'rex', name: 'Rex Raptor', sprite: 'rex_neutral_transparent', rating: 700, level: 'easy',
        blurb: 'Dinosaurs. Big ones. He attacks first and thinks later.',
        eras: [
            era('dk', DK, 22672, 'Rex Raptor (Duelist Kingdom) Deck', 'kale115'),
            era('bc', BC, 34534, 'Dinosaur Ryuzaki (Rex) - Battle City (Concept)', 'AkaiRosé'),
        ],
    },
    {
        id: 'weevil', name: 'Weevil Underwood', sprite: 'weevil_neutral_transparent', rating: 750, level: 'easy',
        blurb: 'Insects, traps and a plan he is very proud of.',
        eras: [
            era('dk', DK, 22669, 'Weevil Underwood (Duelist Kingdom) Deck', 'kale115'),
            era('bc', BC, 22743, 'Weevil Underwood (Battle City) Deck', 'kale115'),
        ],
    },
    {
        id: 'duke', name: 'Duke Devlin', sprite: 'duke_neutral_transparent', rating: 900, level: 'normal',
        blurb: 'Dice, machines and a gambler\'s nerve.',
        eras: [era('bc', BC, 193275, '08 - Duke Devlin (LUCKY DICE)', 'Heragorns')],
    },
    {
        id: 'keith', name: 'Bandit Keith', sprite: 'keith_neutral_transparent', rating: 1000, level: 'normal',
        blurb: 'Machines, 7 Completed and no manners at all.',
        eras: [
            era('dk', DK, 22717, 'Bandit Keith (Duelist Kingdom) Deck', 'kale115'),
            era('bc', `${BC} (possessed)`, 22723, 'Possesed Bandit Keith Deck', 'kale115'),
        ],
    },
    {
        id: 'bakura', name: 'Bakura Ryou', sprite: 'bakura_neutral_transparent', rating: 1050, level: 'normal',
        blurb: 'Polite, quiet, and his deck is full of ghosts.',
        eras: [era('bc', BC, 153201, 'Ryou Bakura Deck', 'Captain Cookie')],
    },
    {
        id: 'mai', name: 'Mai Valentine', sprite: 'mai_neutral_transparent', rating: 1100, level: 'normal',
        blurb: 'Harpie Ladies, and she always knows what you hold.',
        eras: [
            era('dk', DK, 22675, 'Mai Valentine (Duelist Kingdom) Deck', 'kale115'),
            era('bc', BC, 22890, 'Mai Valentine (Battle City) Deck', 'kale115'),
            era('wtd', WTD, 24217, 'Mai Valentine (Waking The Dragons) Deck', 'kale115'),
        ],
    },
    {
        id: 'joey', name: 'Joey Wheeler', sprite: 'joey_neutral_transparent', rating: 1200, level: 'normal',
        blurb: 'Warriors, dice and coins: he never counts himself out.',
        eras: [
            era('dk', DK, 22681, 'Joey Wheeler (Duelist Kingdom) Deck', 'kale115'),
            era('bc', BC, 22878, 'Joey Wheeler (Battle City) Deck', 'kale115'),
            era('wtd', WTD, 23264, 'Joey Wheeler (Waking The Dragons) Deck', 'kale115'),
        ],
    },
    {
        id: 'marik', name: 'Marik Ishtar', sprite: 'marik_neutral_transparent', rating: 1300, level: 'normal',
        blurb: 'Slimes, traps and a god card he can\'t wait to show you.',
        eras: [era('bc', BC, 22729, 'Marik Ishtar (Battle City) Deck', 'kale115')],
    },
    {
        id: 'ishizu', name: 'Ishizu Ishtar', sprite: 'ishizu_neutral_transparent', rating: 1450, level: 'hard',
        blurb: 'She has seen how the duel ends. Your Graveyard is hers.',
        eras: [era('bc', BC, 107419, "Ishizu Ishtar's character deck", 'zcgreenprofile')],
    },
    {
        id: 'pegasus', name: 'Maximillion Pegasus', sprite: 'pegasus_neutral_transparent', rating: 1600, level: 'hard',
        blurb: 'Toon World, Relinquished, and he reads you like a book.',
        eras: [era('dk', DK, 22690, 'Pegasus Deck', 'kale115')],
    },
    {
        id: 'yami_bakura', name: 'Yami Bakura', sprite: 'yami_bakura_neutral_transparent', rating: 1750, level: 'hard',
        blurb: 'Occult cards and cruel tricks. He enjoys this.',
        eras: [
            era('dk', DK, 22684, 'Bakura (Duelist Kingdom) Deck', 'kale115'),
            era('bc', BC, 22881, 'Bakura (Battle City) Deck', 'kale115'),
        ],
    },
    {
        id: 'yami_marik', name: 'Yami Marik', sprite: 'yami_marik_neutral_transparent', rating: 1900, level: 'hard',
        blurb: 'The Winged Dragon of Ra, and pain for the loser.',
        eras: [era('bc', BC, 24569, 'Yami Marik - Battle City', 'AkaiRosé')],
    },
    {
        id: 'yugi', name: 'Yugi Muto', sprite: 'yugi_muto_neutral_transparent', rating: 1950, level: 'hard',
        blurb: 'Dark Magician Girl and the heart of the cards, dueling as himself.',
        eras: [
            era('cd', CD, 65296, 'Yugi Muto Ceremonial Character Deck ( Rivals of The Pharaoh)', 'meecho96',
                comp(625114, 'Dark Magician Girl', 'ThousandStareDragon', GOAT, 'Goat format, 2005')),
            era('dsod', DSOD, 191057, 'Yugi Muto The Dark Side of Dimensions', 'Silent Strike',
                comp(22639, 'Buster Mage', 'Spartanlicious', META, 'the 2016 meta')),
        ],
    },
    {
        id: 'kaiba', name: 'Seto Kaiba', sprite: 'kaiba_neutral_transparent', rating: 2000, level: 'hard',
        blurb: 'Three Blue-Eyes White Dragons, and no patience for friendship speeches.',
        eras: [
            era('dk', DK, 22678, 'Seto Kaiba (Duelist Kingdom) Deck', 'kale115',
                comp(424299, 'Yugi/Kaiba Dragon Turbo', 'Mr.Bones', META, 'Yugi-Kaiba format, 2002')),
            era('bc', BC, 22950, 'Seto Kaiba (Battle city) Deck', 'kale115',
                comp(276001, 'Blue-Eyes White Dragon GOAT', 'DoesMachines', GOAT, 'Goat format, 2005')),
            era('wtd', WTD, 23267, 'Kaiba (Waking The Dragons) Deck', 'kale115',
                comp(621845, 'Blue-Eyes White Dragon OCG September 2005', 'thegamedreamer', META, 'the OCG, September 2005')),
            era('dsod', DSOD, 107253, "Seto Kaiba's character deck (Dark Side Of Dimensions version)", 'zcgreenprofile',
                comp(622, 'Dragons with Eyes of Blue (via 7kolt) V0.3', 'YGOPRODeck Bot', META, 'the 2016 meta')),
        ],
    },
    {
        id: 'yami_yugi', name: 'Yami Yugi', sprite: 'yami_yugi_neutral_transparent', rating: 2100, level: 'hard',
        blurb: 'The King of Games. He believes in his deck, and his deck answers.',
        eras: [
            era('dk', DK, 22693, 'Yugi Muto (Duelist Kingdom) Deck', 'kale115',
                comp(424302, 'Yugi/Kaiba Summoned Skull Exchange', 'Mr.Bones', META, 'Yugi-Kaiba format, 2002')),
            era('bc', BC, 22714, 'Yugi Muto (Battle City) Deck', 'kale115',
                comp(302453, 'Dark Magicians - GOAT', 'Beta464', GOAT, 'Goat format, 2005')),
            era('wtd', WTD, 22966, 'Yugi (Waking the Dragons) Deck', 'kale115',
                comp(512812, 'Dark Magician GOAT', 'bpogor', GOAT, 'Goat format, 2005')),
        ],
    },
];

/** `url`: the list's page on YGOPRODeck. */
export type DuelistDeck = { main: number[]; extra: number[]; url: string };
const DECKS = decks as Record<string, DuelistDeck>;

export function duelistById(id: string): Duelist | undefined {
    return DUELISTS.find((d) => d.id === id);
}

/** Whether `era` names one of the duelist's decks (an era, or an era's competitive build: `bc+`). */
export function duelistHasEra(duelist: Duelist, era: string): boolean {
    const competitive = era.endsWith('+');
    const found = duelist.eras.find((e) => e.id === (competitive ? era.slice(0, -1) : era));
    return !!found && (!competitive || !!found.competitive);
}

/**
 * A duelist's deck in one of their eras, or its competitive build (`bc+`); their first era's
 * when `era` is missing or unknown. `id`: the deck's own id (`bc`, `bc+`), `source`: where it's from.
 */
export function duelistDeck(duelist: Duelist, era?: string): { era: DuelistEra; id: string; competitive: boolean; source: DeckSource; deck: DuelistDeck } {
    const wantsCompetitive = !!era?.endsWith('+');
    const chosen = duelist.eras.find((e) => e.id === (wantsCompetitive ? era!.slice(0, -1) : era)) ?? duelist.eras[0]!;
    const competitive = wantsCompetitive && !!chosen.competitive;
    const id = `${chosen.id}${competitive ? '+' : ''}`;
    const deck = DECKS[`${duelist.id}:${id}`];
    if (!deck) throw new Error(`No deck built for ${duelist.id}:${id}: run api/scripts/build-duelists.ts`);
    return { era: chosen, id, competitive, source: competitive ? chosen.competitive! : chosen.source, deck };
}
