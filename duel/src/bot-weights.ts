/*
 * The weights of the bot's score of a position (bot-eval.ts `features`), in its own points (a card in
 * hand about 380). Each feature counts the bot's side plus and the rival's minus.
 */

export type Feature =
    | 'lp' | 'lowLp'
    | 'hand' | 'handRemoval' | 'handStrength'
    | 'monster' | 'monsterAtk' | 'monsterDef' | 'hiddenBonus' | 'pressure'
    | 'set' | 'faceUp'
    | 'riskMine' | 'riskTheirs' | 'latent' | 'control';

/** Set by hand: what the bot played with before its weights were fitted. */
export const HAND_SET: Record<Feature, number> = {
    /** Each Life Point, and each of the last 2000 again (the duel is close to over). */
    lp: 0.45, lowLp: 0.45,
    /** A card in hand; the bot's own removal and strong monsters kept (resource conservation). */
    hand: 380, handRemoval: 0, handStrength: 0,
    /** A monster, its ATK and DEF; a face-down one of the bot's (the rival doesn't know it; a Flip effect to come). */
    monster: 300, monsterAtk: 0.5, monsterDef: 0.2, hiddenBonus: 1,
    /** The damage face-up attackers threaten (more before their Battle Phase, against an empty field). */
    pressure: 1,
    /** A Set Spell or Trap; a face-up one that stays (Continuous, Equip, Field). */
    set: 420, faceUp: 250,
    /** What the bot's monsters stand to lose to the rival's attackers, what the rival's do to its, and to what they may summon next. */
    riskMine: -0.75, riskTheirs: 0.35, latent: -0.4,
    /** Holding the strongest monster on the field (board advantage), or the rival holding it. */
    control: 0,
};

/**
 * Fitted to who went on to win, in 451 bot-vs-bot games with the duelists' decks (25,456 positions;
 * scripts/bot-lab/record.ts, fit-weights.ts with L2 1000): started from the hand-set weights, each
 * moved only as far as the games showed. Board advantage (`control`) and removal kept in hand weigh
 * the most of what's new; a card in hand less than set, a monster on the field more.
 */
export const FITTED: Record<Feature, number> = {
    lp: 0.599, lowLp: 0.456,
    hand: 253, handRemoval: 710, handStrength: -159,
    monster: 660, monsterAtk: 0.523, monsterDef: 0.07, hiddenBonus: 2.74,
    pressure: 1.59,
    set: 443, faceUp: 155,
    riskMine: -0.043, riskTheirs: -0.047, latent: -0.478,
    control: 1100,
};

/**
 * The weights the bot plays with: the hand-set ones (FITTED predicts who wins better, but didn't play
 * better: 58-61 against them in 119 games; tune.ts tunes them by playing instead). Mutable, for the lab.
 */
export const WEIGHTS: Record<Feature, number> = { ...HAND_SET };
