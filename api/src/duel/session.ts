import {
    OcgDuelMode, OcgLocation as L, OcgMessageType as M, OcgPhase, OcgPosition as P, OcgProcessResult, OcgQueryFlags as Q, OcgResponseType as R, type OcgQueryFlags,
    SelectBattleCMDAction as B, SelectIdleCMDAction as I,
    type OcgCardLoc, type OcgDuelHandle, type OcgMessage, type OcgResponse,
} from 'ocgcore-wasm';
import type {
    ActionVerb, DuelAnswer, DuelCardView, PlaceZone, DuelEvent, DuelFrame, DuelModeId, DuelPrompt, DuelSideView, DuelState, DuelView, Phase, PromptCard, Side, Zone,
} from '@ygo/shared';
import { botAnswer } from './bot';
import type { Engine } from './engine';

/*
 * One duel: the engine instance, the answers given so far (the duel is rebuilt from its seed and
 * these), and what each player may see. Players are teams 0 and 1; team 0 goes first.
 */

export type Team = 0 | 1;

export interface DuelSetup {
    /** Xoshiro256** seed, as decimal strings (stored as-is). */
    seed: [string, string, string, string];
    mode: DuelModeId;
    /** By team. */
    decks: [{ main: number[]; extra: number[] }, { main: number[]; extra: number[] }];
    names: [string, string];
    bots: [boolean, boolean];
    /** Solo practice: the bot never plays, it only passes its turns (a goldfish to test your deck on). */
    solo?: boolean;
    /** Older versions played in place of a deck card (engine code → the card's own code), shown as the card itself. */
    shown?: Record<string, number>;
    /**
     * The rules the duel was started under. A duel is rebuilt by replaying its answers, so a change
     * to what the server answers by itself must not apply to duels already underway: their stored
     * answers would land on the wrong questions. Missing means 1.
     *   2: a lone mandatory effect resolves without asking.
     */
    rules?: number;
}

/** The rules new duels start under (see DuelSetup.rules). */
export const DUEL_RULES = 2;

export const MODE_FLAGS: Record<DuelModeId, bigint> = {
    MR1: OcgDuelMode.MODE_MR1,
    MR2: OcgDuelMode.MODE_MR2,
    MR3: OcgDuelMode.MODE_MR3,
    MR4: OcgDuelMode.MODE_MR4,
};

const FRAME_CAP = 300;
const START_LP = 8000;
const CARD_FLAGS = (Q.CODE | Q.POSITION | Q.ATTACK | Q.DEFENSE | Q.BASE_ATTACK | Q.BASE_DEFENSE) as OcgQueryFlags;
const STAT_FLAGS = (Q.ATTACK | Q.DEFENSE | Q.POSITION | Q.CODE) as OcgQueryFlags;
/** What acts on a card on the field: what it's equipped to, what it targets, its counters and status. */
const LINK_FLAGS = (Q.CODE | Q.POSITION | Q.EQUIP_CARD | Q.TARGET_CARD | Q.COUNTERS | Q.STATUS) as OcgQueryFlags;
/** ocgcore's STATUS_DISABLED: the card's effects are negated. */
const STATUS_DISABLED = 0x0001;
type MessageOf<T extends M> = Extract<OcgMessage, { type: T }>;

/** A seeded Fisher-Yates shuffle (mulberry32), so a replay deals the same cards. */
export function shuffled<T>(list: readonly T[], seed: bigint): T[] {
    let a = Number(seed % 4294967296n);
    const rand = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
}

const PILES = [L.HAND, L.GRAVE, L.REMOVED, L.EXTRA] as const;

/** Follows cards between zones, so a card keeps one uid as it moves (the board animates by it). */
class Tracker {
    private n = 0;
    private slots = new Map<string, string>();
    private piles = new Map<string, string[]>();
    fresh = () => `u${++this.n}`;
    private isPile = (location: number) => (PILES as readonly number[]).includes(location);
    private pile(controller: number, location: number) {
        const key = `${controller}:${location}`;
        let p = this.piles.get(key);
        if (!p) this.piles.set(key, (p = []));
        return p;
    }
    uidAt(controller: number, location: number, sequence: number): string {
        if (location === L.DECK) return this.fresh();
        if (this.isPile(location)) {
            const p = this.pile(controller, location);
            while (p.length <= sequence) p.push(this.fresh());
            return p[sequence]!;
        }
        const key = `${controller}:${location}:${sequence}`;
        let uid = this.slots.get(key);
        if (!uid) this.slots.set(key, (uid = this.fresh()));
        return uid;
    }
    private take(controller: number, location: number, sequence: number): string {
        if (location === L.DECK || !location) return this.fresh();
        if (this.isPile(location)) {
            const p = this.pile(controller, location);
            return p.splice(sequence, 1)[0] ?? this.fresh();
        }
        const key = `${controller}:${location}:${sequence}`;
        const uid = this.slots.get(key) ?? this.fresh();
        this.slots.delete(key);
        return uid;
    }
    private put(controller: number, location: number, sequence: number, uid: string) {
        if (location === L.DECK || !location) return;
        if (this.isPile(location)) this.pile(controller, location).splice(Math.min(sequence, this.pile(controller, location).length), 0, uid);
        else this.slots.set(`${controller}:${location}:${sequence}`, uid);
    }
    move(from: { controller: number; location: number; sequence: number }, to: { controller: number; location: number; sequence: number }): string {
        const uid = this.take(from.controller, from.location, from.sequence);
        this.put(to.controller, to.location, to.sequence, uid);
        return uid;
    }
    draw(controller: number, count: number) {
        const p = this.pile(controller, L.HAND);
        for (let i = 0; i < count; i++) p.push(this.fresh());
    }
    swap(a: { controller: number; location: number; sequence: number }, b: { controller: number; location: number; sequence: number }) {
        const ka = `${a.controller}:${a.location}:${a.sequence}`, kb = `${b.controller}:${b.location}:${b.sequence}`;
        const ua = this.slots.get(ka), ub = this.slots.get(kb);
        if (ub) this.slots.set(ka, ub); else this.slots.delete(ka);
        if (ua) this.slots.set(kb, ua); else this.slots.delete(kb);
    }
    /** If the engine's count of a pile differs from what was tracked, believe the engine. */
    fit(controller: number, location: number, count: number) {
        const p = this.pile(controller, location);
        while (p.length < count) p.push(this.fresh());
        p.length = count;
    }
}

const zoneOf = (location: number, sequence: number): Zone => {
    switch (location) {
        case L.HAND: return 'hand';
        case L.MZONE: return 'monster';
        case L.SZONE: return sequence === 5 ? 'field' : sequence >= 6 ? 'pendulum' : 'spell';
        case L.GRAVE: return 'grave';
        case L.REMOVED: return 'banished';
        case L.EXTRA: return 'extra';
        default: return 'deck';
    }
};
const phaseOf = (p: number): Phase =>
    p === OcgPhase.DRAW ? 'DP' : p === OcgPhase.STANDBY ? 'SP' : p === OcgPhase.MAIN1 ? 'M1' : p === OcgPhase.MAIN2 ? 'M2' : p === OcgPhase.END ? 'EP' : 'BP';
const faceUp = (position: number) => (position & P.FACEUP) !== 0;
const POSITION_LABEL: Record<number, string> = {
    [P.FACEUP_ATTACK]: 'Attack Position',
    [P.FACEDOWN_ATTACK]: 'Face-down Attack Position',
    [P.FACEUP_DEFENSE]: 'Defense Position',
    [P.FACEDOWN_DEFENSE]: 'Set (face-down Defense Position)',
};
const RACES = ['Warrior', 'Spellcaster', 'Fairy', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Dragon', 'Beast', 'Beast-Warrior', 'Dinosaur', 'Fish', 'Sea Serpent', 'Reptile', 'Psychic', 'Divine-Beast', 'Creator God', 'Wyrm', 'Cyberse'];
const ATTRIBUTES = ['EARTH', 'WATER', 'FIRE', 'WIND', 'LIGHT', 'DARK', 'DIVINE'];

/** The question the engine is waiting on, and how to turn an answer into the engine's response. */
interface Question {
    team: Team;
    prompt: DuelPrompt;
    toResponse: (answer: DuelAnswer) => OcgResponse | null;
}

export class DuelSession {
    readonly answers: OcgResponse[] = [];
    seq = 0;
    result: { winner: Team | null; reason: string } | null = null;
    private handle: OcgDuelHandle | null = null;
    private tracker = new Tracker();
    private question: Question | null = null;
    private retry = false;
    private replayQueue: OcgResponse[] = [];
    private frames: [DuelFrame[], DuelFrame[]] = [[], []];
    private lp: [number, number] = [START_LP, START_LP];
    private turn = 0;
    private turnPlayer: Team = 0;
    private phase: Phase = 'DP';
    private chain: { code: number; team: Team; uid?: string }[] = [];
    /** Who made the last play (a summon, Set, attack or activation): a chain window after your own play is quiet. */
    private lastActor: Team | null = null;
    /** Cards whose chain link just resolved: a spell or trap going to the Graveyard after it isn't destroyed. */
    private resolved = new Set<string>();
    /** For the bot: actions taken this turn, so it can't loop. */
    botActions = 0;

    constructor(private readonly engine: Engine, readonly setup: DuelSetup) {}

    /** The code a player sees: an older version shows as the card they own. */
    private show = (code: number) => this.setup.shown?.[String(code)] ?? code;

    /** Starts the duel, replaying `answers` (from storage) to rebuild where it was. */
    start(answers: readonly OcgResponse[] = []): void {
        const { core } = this.engine;
        const seed = this.setup.seed.map(BigInt) as [bigint, bigint, bigint, bigint];
        const team = { startingLP: START_LP, startingDrawCount: 5, drawCountPerTurn: 1 };
        const handle = core.createDuel({
            flags: MODE_FLAGS[this.setup.mode],
            seed,
            team1: team,
            team2: team,
            cardReader: (code) => this.engine.cardData(code),
            scriptReader: (name) => this.engine.readScript(name),
            errorHandler: () => undefined,
        });
        if (!handle) throw new Error('The duel engine could not start a duel');
        this.handle = handle;
        for (const lib of ['constant.lua', 'utility.lua']) core.loadScript(handle, lib, this.engine.readScript(lib) ?? '');
        for (const t of [0, 1] as const) {
            const deck = this.setup.decks[t];
            for (const code of shuffled(deck.main, seed[0] * 2n + BigInt(t)))
                core.duelNewCard(handle, { team: t, duelist: 0, code, controller: t, location: L.DECK, sequence: 0, position: P.FACEDOWN_DEFENSE });
            for (const code of deck.extra)
                core.duelNewCard(handle, { team: t, duelist: 0, code, controller: t, location: L.EXTRA, sequence: 0, position: P.FACEDOWN_DEFENSE });
        }
        core.startDuel(handle);
        this.replayQueue = [...answers];
        this.run();
        // Every stored answer must land where it was given. One left over, or one the engine refused,
        // means the replay went another way (the rules changed under the duel): say so, don't stall.
        const left = this.replayQueue.length;
        this.replayQueue = [];
        if (answers.length && (left || this.retry)) throw new Error(`The duel could not be rebuilt from its answers (${left} left over${this.retry ? ', one refused' : ''})`);
        // A rebuilt duel's frames (from before a restart) are history: the board starts from the state
        // now. A new duel keeps them, so the first look at it shows the decks dealt out.
        if (answers.length) {
            this.frames = [[], []];
            this.delivered = [true, true];
        }
    }

    /** Whether a player has been sent this duel's frames yet: the first connection gets them from the start. */
    private delivered: [boolean, boolean] = [false, false];

    /**
     * What a player connecting now should watch: the duel from its start if they're the first to
     * look (the opening hands drawn, the bot's first turn), otherwise nothing (they get the board as it is).
     */
    framesOnConnect(team: Team): DuelFrame[] {
        const fresh = !this.delivered[team];
        const frames = this.takeFrames(team);
        return fresh ? frames : [];
    }

    destroy(): void {
        if (this.handle) this.engine.core.destroyDuel(this.handle);
        this.handle = null;
    }

    /** Whose answer the duel is waiting for. */
    waitingFor(): Team | null {
        return this.question?.team ?? null;
    }

    /** A player's answer. False if it isn't their question, it's stale, or it doesn't fit the question. */
    answer(team: Team, seq: number, answer: DuelAnswer): boolean {
        const q = this.question;
        if (!q || q.team !== team || seq !== this.seq || this.result) return false;
        const response = q.toResponse(answer);
        if (!response) return false;
        this.respond(response);
        return true;
    }

    concede(team: Team): void {
        if (this.result) return;
        this.result = { winner: (1 - team) as Team, reason: `${this.setup.names[team]} surrendered` };
        this.question = null;
        this.pushFrame([{ k: 'win', side: 'me', reason: this.result.reason }], 1 - team as Team);
        this.destroy();
    }

    /** The frames a player hasn't been sent yet (cleared). */
    takeFrames(team: Team): DuelFrame[] {
        this.delivered[team] = true;
        const out = this.frames[team];
        this.frames[team] = [];
        return out;
    }

    state(team: Team, duelId: string): DuelState {
        const rival = (1 - team) as Team;
        const mine = this.question?.team === team;
        return {
            duelId,
            seq: this.seq,
            you: { name: this.setup.names[team] },
            rival: { name: this.setup.names[rival], bot: this.setup.bots[rival], ...(this.setup.solo ? { solo: true } : {}) },
            view: this.view(team),
            prompt: mine && !this.result ? this.question!.prompt : null,
            ...(mine && this.retry ? { retry: true } : {}),
            result: this.result ? { winner: this.result.winner === null ? null : this.result.winner === team ? 'me' : 'opp', reason: this.result.reason } : null,
        };
    }

    // ---- the engine loop ------------------------------------------------------------------

    private respond(response: OcgResponse) {
        this.answers.push(response);
        this.seq++;
        this.retry = false;
        this.question = null;
        this.engine.core.duelSetResponse(this.handle!, response);
        this.run();
    }

    private run() {
        const { core } = this.engine;
        for (let guard = 0; guard < 200_000 && this.handle; guard++) {
            const status = core.duelProcess(this.handle);
            const messages = core.duelGetMessage(this.handle);
            const events = this.apply(messages);
            if (events.length && !this.replayQueue.length) for (const t of [0, 1] as const) this.pushFrame(this.eventsFor(events, t), t);
            if (this.result || status === OcgProcessResult.END) {
                this.result ??= { winner: null, reason: 'The duel ended' };
                this.destroy();
                return;
            }
            if (status === OcgProcessResult.CONTINUE) continue;

            const last = messages[messages.length - 1];
            if (!last) return;
            if (last.type === M.RETRY) {
                // The last answer wasn't allowed: take it back and ask the same question again.
                this.answers.pop();
                this.retry = true;
                const asked = [...messages].reverse().find((m: OcgMessage) => m.type !== M.RETRY && 'player' in m);
                this.question = asked ? this.ask(asked) : this.lastQuestion;
                if (this.question?.team !== undefined && this.setup.bots[this.question.team]) {
                    throw new Error('The bot gave an answer the engine refused');
                }
                return;
            }
            // Answers come, in order, from: the server itself (zones, ordering), the bot, or a player.
            // When rebuilding a stored duel, each is taken from the stored list instead.
            const auto = this.autoAnswer(last);
            if (auto) {
                this.feed(this.replayQueue.shift() ?? auto);
                continue;
            }
            const question = this.ask(last);
            if (!question) throw new Error(`The duel server can't ask engine message ${last.type}`);
            if (this.setup.bots[question.team]) {
                this.feed(this.replayQueue.shift() ?? botAnswer(last, this, question.team, this.setup.solo));
                continue;
            }
            const replayed = this.replayQueue.shift();
            if (replayed) {
                this.seq++;
                this.feed(replayed);
                continue;
            }
            this.question = question;
            this.lastQuestion = question;
            return;
        }
    }

    private feed(response: OcgResponse) {
        this.answers.push(response);
        this.engine.core.duelSetResponse(this.handle!, response);
    }
    private lastQuestion: Question | null = null;

    private pushFrame(events: DuelEvent[], team: Team) {
        if (!events.length) return;
        const list = this.frames[team];
        list.push({ events, view: this.view(team) });
        if (list.length > FRAME_CAP) list.splice(0, list.length - FRAME_CAP);
    }

    /** Questions nobody needs to see: zone placement, ordering, passing with nothing to chain. */
    private autoAnswer(m: OcgMessage): OcgResponse | null {
        switch (m.type) {
            case M.SELECT_PLACE:
            case M.SELECT_DISFIELD: {
                // A player chooses the zone (as on EDOPro), unless there's no choice to make; the bot takes the middle-most.
                if (!this.setup.bots[m.player as Team] && openZones(m.field_mask).length > m.count) return null;
                const places = [];
                let mask = m.field_mask;
                for (let i = 0; i < m.count; i++) {
                    const place = freePlace(mask, m.player);
                    places.push(place.place);
                    mask |= 1 << place.bit;
                }
                return m.type === M.SELECT_PLACE ? { type: R.SELECT_PLACE, places } : { type: R.SELECT_DISFIELD, places };
            }
            case M.SORT_CARD:
            case M.SORT_CHAIN:
                return { type: R.SORT_CARD, order: null };
            case M.SELECT_CHAIN:
                // Nothing to activate: pass. One mandatory effect (Ekibyo Drakmord destroying its monster):
                // there's no choice to make, so it just happens.
                if (!m.selects.length && !m.forced) return { type: R.SELECT_CHAIN, index: null };
                return m.forced && m.selects.length === 1 && (this.setup.rules ?? 1) >= 2 ? { type: R.SELECT_CHAIN, index: 0 } : null;
            case M.SELECT_COUNTER: {
                let left = m.count;
                const counters = m.cards.map((c) => {
                    const take = Math.min(left, (c as unknown as { count: number }).count ?? 0);
                    left -= take;
                    return take;
                });
                return { type: R.SELECT_COUNTER, counters };
            }
            case M.ROCK_PAPER_SCISSORS:
                return { type: R.ROCK_PAPER_SCISSORS, value: 1 };
            default:
                return null;
        }
    }

    // ---- messages → state and events -------------------------------------------------------

    /** Updates what the server tracks from the engine's messages; returns events (with teams, not sides). */
    private apply(messages: OcgMessage[]): TeamEvent[] {
        const out: TeamEvent[] = [];
        for (const m of messages) {
            switch (m.type) {
                case M.NEW_TURN:
                    this.turn++;
                    this.turnPlayer = m.player as Team;
                    this.botActions = 0;
                    out.push({ k: 'turn', team: m.player as Team, turn: this.turn });
                    break;
                case M.NEW_PHASE:
                    this.resolved.clear();
                    this.phase = phaseOf(m.phase);
                    out.push({ k: 'phase', phase: this.phase });
                    break;
                case M.SHUFFLE_DECK:
                    out.push({ k: 'shuffle', team: m.player as Team });
                    break;
                case M.DRAW:
                    this.tracker.draw(m.player, m.drawn.length);
                    out.push({ k: 'draw', team: m.player as Team, count: m.drawn.length });
                    break;
                case M.SUMMONING:
                case M.SPSUMMONING:
                case M.FLIPSUMMONING:
                    out.push({ k: 'summon', team: m.controller, code: m.code, how: m.type === M.SUMMONING ? 'normal' : m.type === M.FLIPSUMMONING ? 'flip' : 'special' });
                    break;
                case M.SET:
                    out.push({ k: 'set', team: m.controller });
                    break;
                case M.CHAINING: {
                    const uid = m.location === L.DECK ? undefined : this.tracker.uidAt(m.controller, m.location, m.sequence);
                    this.chain.push({ code: m.code, team: m.controller, uid });
                    out.push({ k: 'activate', team: m.controller, code: m.code, uid, link: this.chain.length });
                    break;
                }
                case M.CHAIN_SOLVED: {
                    const link = this.chain[m.chain_size - 1];
                    if (link?.uid) this.resolved.add(link.uid);
                    this.chain.length = Math.max(0, m.chain_size - 1);
                    out.push({ k: 'resolved', link: m.chain_size });
                    break;
                }
                case M.CHAIN_NEGATED:
                case M.CHAIN_DISABLED:
                    out.push({ k: 'negated', link: m.chain_size });
                    break;
                case M.CHAIN_END:
                    this.chain = [];
                    break;
                case M.ATTACK: {
                    const a = m.card;
                    out.push({
                        k: 'attack', team: a.controller,
                        attacker: this.tracker.uidAt(a.controller, a.location, a.sequence),
                        target: m.target ? this.tracker.uidAt(m.target.controller, m.target.location, m.target.sequence) : undefined,
                    });
                    break;
                }
                case M.MOVE: {
                    const fromField = m.from.location === L.MZONE || m.from.location === L.SZONE;
                    const uidBefore = fromField ? this.tracker.uidAt(m.from.controller, m.from.location, m.from.sequence) : undefined;
                    // A monster leaving the field for the Graveyard breaks; a spell that just resolved doesn't.
                    if (uidBefore && m.to.location === L.GRAVE && (m.from.location === L.MZONE || !(this.chain.some((c) => c.uid === uidBefore) || this.resolved.has(uidBefore))))
                        out.push({ k: 'destroyed', uid: uidBefore, code: m.card });
                    const uid = this.tracker.move(m.from, m.to);
                    out.push({
                        k: 'move', uid, code: m.card, team: (m.to.location ? m.to.controller : m.from.controller) as Team,
                        from: zoneOf(m.from.location, m.from.sequence), to: zoneOf(m.to.location, m.to.sequence),
                        public: faceUp(m.to.position) && m.to.location !== L.HAND && m.to.location !== L.DECK,
                    });
                    break;
                }
                case M.SWAP:
                    this.tracker.swap(m.card1, m.card2);
                    break;
                case M.POS_CHANGE:
                    out.push({ k: 'reposition', uid: this.tracker.uidAt(m.controller, m.location, m.sequence), code: m.code, public: faceUp(m.position) });
                    break;
                case M.DAMAGE:
                    this.lp[m.player as Team] = Math.max(0, this.lp[m.player as Team] - m.amount);
                    out.push({ k: 'damage', team: m.player as Team, amount: m.amount });
                    break;
                case M.PAY_LPCOST:
                    this.lp[m.player as Team] = Math.max(0, this.lp[m.player as Team] - m.amount);
                    out.push({ k: 'pay', team: m.player as Team, amount: m.amount });
                    break;
                case M.RECOVER:
                    this.lp[m.player as Team] += m.amount;
                    out.push({ k: 'recover', team: m.player as Team, amount: m.amount });
                    break;
                case M.LPUPDATE:
                    this.lp[m.player as Team] = m.lp;
                    break;
                case M.WIN:
                    this.result = { winner: m.player === 0 || m.player === 1 ? (m.player as Team) : null, reason: this.engine.victoryReason(m.reason) };
                    out.push({ k: 'win', team: this.result.winner, reason: this.result.reason });
                    break;
                default:
                    break;
            }
        }
        for (const e of out) {
            if (e.k === 'turn') this.lastActor = null;
            if ((e.k === 'summon' || e.k === 'set' || e.k === 'attack' || e.k === 'activate') && 'team' in e) this.lastActor = e.team;
        }
        return out;
    }

    /** The events as `team` may see them: sides instead of teams, hidden cards without codes. */
    private eventsFor(events: TeamEvent[], team: Team): DuelEvent[] {
        const side = (t: Team | null): Side => (t === team ? 'me' : 'opp');
        return events.map((e): DuelEvent => {
            switch (e.k) {
                case 'turn': return { k: 'turn', side: side(e.team), turn: e.turn };
                case 'draw': return { k: 'draw', side: side(e.team), count: e.count };
                case 'shuffle': return { k: 'shuffle', side: side(e.team) };
                case 'summon': return { k: 'summon', side: side(e.team), code: this.show(e.code), how: e.how };
                case 'set': return { k: 'set', side: side(e.team) };
                case 'activate': return { k: 'activate', side: side(e.team), code: this.show(e.code), uid: e.uid, link: e.link };
                case 'attack': return { k: 'attack', side: side(e.team), attacker: e.attacker, target: e.target };
                case 'move': return { k: 'move', uid: e.uid, code: e.public || e.team === team ? this.show(e.code) : 0, side: side(e.team), from: e.from, to: e.to };
                case 'reposition': return { k: 'reposition', uid: e.uid, code: e.public ? this.show(e.code) : 0 };
                case 'damage': case 'pay': case 'recover': return { k: e.k, side: side(e.team), amount: e.amount };
                case 'win': return { k: 'win', side: e.team === null ? null : side(e.team), reason: e.reason };
                case 'destroyed': return { k: 'destroyed', uid: e.uid, code: this.show(e.code) };
                default: return e;
            }
        });
    }

    // ---- views -------------------------------------------------------------------------------

    /** The field as `team` may see it. */
    view(team: Team): DuelView {
        const side = (t: Team): DuelSideView => this.sideView(t, team);
        const me = side(team), opp = side((1 - team) as Team);
        this.markAffected({ [team]: me, [1 - team]: opp } as Record<Team, DuelSideView>);
        const emz: DuelView['extraMonsters'] = [null, null];
        if (this.setup.mode === 'MR4' && this.handle) {
            for (const t of [0, 1] as const) {
                const row = this.engine.core.duelQueryLocation(this.handle, { flags: CARD_FLAGS, controller: t, location: L.MZONE });
                for (const seq of [5, 6]) {
                    const card = row[seq] ? this.cardView(row[seq]!, t, L.MZONE, seq, team) : null;
                    // Sequence 5 is the left zone as team 0 sees it; the other team sees it mirrored.
                    if (card) emz[t === team ? seq - 5 : 6 - seq] = { side: t === team ? 'me' : 'opp', card };
                }
            }
        }
        return {
            mode: this.setup.mode,
            turn: this.turn,
            turnPlayer: this.turnPlayer === team ? 'me' : 'opp',
            phase: this.phase,
            me,
            opp,
            extraMonsters: emz,
            chain: this.chain.map((c) => ({ code: this.show(c.code), side: c.team === team ? 'me' : 'opp', uid: c.uid })),
        };
    }

    private sideView(t: Team, viewer: Team): DuelSideView {
        const empty: DuelSideView = { name: this.setup.names[t], lp: this.lp[t], hand: [], monsters: Array(5).fill(null), spells: Array(5).fill(null), field: null, pendulum: [null, null], grave: [], banished: [], deck: 0, extra: 0 };
        if (!this.handle) return empty;
        const { core } = this.engine;
        const query = (location: number) => core.duelQueryLocation(this.handle!, { flags: CARD_FLAGS, controller: t, location: location as never });
        const pile = (location: number) => {
            const cards = query(location);
            this.tracker.fit(t, location, cards.length);
            return cards.flatMap((c, i) => (c ? [this.cardView(c, t, location, i, viewer)] : []));
        };
        const mz = query(L.MZONE), sz = query(L.SZONE);
        const slot = (row: typeof mz, location: number, seq: number) => (row[seq] ? this.cardView(row[seq]!, t, location, seq, viewer) : null);
        return {
            ...empty,
            hand: pile(L.HAND),
            monsters: [0, 1, 2, 3, 4].map((s) => slot(mz, L.MZONE, s)),
            spells: [0, 1, 2, 3, 4].map((s) => slot(sz, L.SZONE, s)),
            field: slot(sz, L.SZONE, 5),
            pendulum: [slot(sz, L.SZONE, 6), slot(sz, L.SZONE, 7)],
            grave: pile(L.GRAVE),
            banished: pile(L.REMOVED),
            deck: core.duelQueryCount(this.handle, t, L.DECK),
            extra: core.duelQueryCount(this.handle, t, L.EXTRA),
        };
    }

    /** Marks the cards on the field that something acts on, so the board can show it. */
    private markAffected(sides: Record<Team, DuelSideView>) {
        if (!this.handle) return;
        const { core } = this.engine;
        const at = (t: number, location: number, seq: number): DuelCardView | null => {
            const side = sides[t as Team];
            if (location === L.MZONE) return side.monsters[seq] ?? null;
            if (location === L.SZONE) return seq < 5 ? (side.spells[seq] ?? null) : seq === 5 ? side.field : (side.pendulum[seq - 6] ?? null);
            return null;
        };
        for (const t of [0, 1] as const) {
            for (const location of [L.MZONE, L.SZONE]) {
                core.duelQueryLocation(this.handle, { flags: LINK_FLAGS, controller: t, location }).forEach((c, seq) => {
                    const card = c && at(t, location, seq);
                    if (!c || !card || !faceUp(c.position ?? 0)) return;
                    const total = Object.values(c.counters ?? {}).reduce((a, n) => a + n, 0);
                    if (total) card.counters = total;
                    if ((c.status ?? 0) & STATUS_DISABLED) card.negated = true;
                    for (const target of [...(c.equipCard ? [c.equipCard] : []), ...(c.targetCards ?? [])]) {
                        const hit = at(target.controller, target.location, target.sequence);
                        if (hit && hit.uid !== card.uid && !hit.by?.some((b) => b.uid === card.uid)) (hit.by ??= []).push({ uid: card.uid, code: card.code });
                    }
                });
            }
        }
    }

    private cardView(c: { code?: number; position?: number; attack?: number; defense?: number; baseAttack?: number; baseDefense?: number }, controller: Team, location: number, sequence: number, viewer: Team): DuelCardView {
        const position = c.position ?? P.FACEDOWN_DEFENSE;
        const up = location === L.GRAVE || (location === L.REMOVED ? faceUp(position) : location === L.HAND ? false : faceUp(position));
        // The owner sees their own hand and Set cards; nobody sees the rival's.
        const visible = up || controller === viewer;
        const field = location === L.MZONE;
        return {
            uid: this.tracker.uidAt(controller, location, sequence),
            code: visible ? this.show(c.code ?? 0) : 0,
            faceUp: location === L.HAND ? controller === viewer : up,
            defense: field && (position & P.DEFENSE) !== 0,
            ...(field && up ? { atk: c.attack, def: c.defense, baseAtk: c.baseAttack, baseDef: c.baseDefense } : {}),
        };
    }

    // ---- engine questions → prompts --------------------------------------------------------

    private ref(c: OcgCardLoc, id: number, asker: Team): PromptCard {
        return {
            id, code: c.location === L.DECK && c.controller !== asker ? 0 : this.show(c.code), side: c.controller === asker ? 'me' : 'opp',
            where: zoneOf(c.location, c.sequence),
            ...(c.location !== L.DECK ? { uid: this.tracker.uidAt(c.controller, c.location, c.sequence) } : {}),
        };
    }

    private ask(m: OcgMessage): Question | null {
        if (!('player' in m)) return null;
        const team = m.player as Team;
        const describe = (d: bigint) => this.engine.describe(d) || undefined;
        const q = (prompt: DuelPrompt, toResponse: Question['toResponse']): Question => ({ team, prompt, toResponse });
        const choice = (a: DuelAnswer) => (a.kind === 'choice' ? a.id : null);
        const many = (a: DuelAnswer) => (a.kind === 'many' ? a.ids : null);
        const inRange = (ids: number[] | null, n: number, min: number, max: number) =>
            ids && ids.length >= min && ids.length <= max && new Set(ids).size === ids.length && ids.every((i) => i >= 0 && i < n) ? ids : null;

        switch (m.type) {
            case M.SELECT_IDLECMD: {
                const groups: [I, ActionVerb, OcgCardLoc[]][] = [
                    [I.SELECT_SUMMON, 'summon', m.summons], [I.SELECT_SPECIAL_SUMMON, 'special', m.special_summons],
                    [I.SELECT_POS_CHANGE, 'reposition', m.pos_changes], [I.SELECT_MONSTER_SET, 'set', m.monster_sets],
                    [I.SELECT_SPELL_SET, 'set-spell', m.spell_sets], [I.SELECT_ACTIVATE, 'activate', m.activates],
                ];
                const actions = groups.flatMap(([action, verb, list]) => list.map((c, index) => {
                    const r = this.ref(c, action * 1000 + index, team);
                    const text = 'description' in c ? describe((c as { description: bigint }).description) : undefined;
                    return { id: r.id, uid: r.uid, code: this.show(c.code), where: r.where, verb, ...(text ? { text } : {}) };
                }));
                const next = [...(m.to_bp ? [{ id: I.TO_BP * 1000, to: 'BP' as const }] : []), ...(m.to_ep ? [{ id: I.TO_EP * 1000, to: 'EP' as const }] : [])];
                const ids = new Set([...actions.map((a) => a.id), ...next.map((n) => n.id)]);
                return q({ kind: 'actions', phase: 'main', actions, next }, (a) => {
                    const id = choice(a);
                    if (id === null || !ids.has(id)) return null;
                    const action = Math.floor(id / 1000) as I;
                    return { type: R.SELECT_IDLECMD, action, index: action === I.TO_BP || action === I.TO_EP ? null : id % 1000 };
                });
            }
            case M.SELECT_BATTLECMD: {
                const actions = [
                    ...m.chains.map((c, index) => {
                        const r = this.ref(c, B.SELECT_CHAIN * 1000 + index, team);
                        const text = describe(c.description);
                        return { id: r.id, uid: r.uid, code: this.show(c.code), where: r.where, verb: 'activate' as const, ...(text ? { text } : {}) };
                    }),
                    ...m.attacks.map((c, index) => {
                        const r = this.ref(c, B.SELECT_BATTLE * 1000 + index, team);
                        return { id: r.id, uid: r.uid, code: this.show(c.code), where: r.where, verb: c.can_direct ? ('attack-direct' as const) : ('attack' as const) };
                    }),
                ];
                const next = [...(m.to_m2 ? [{ id: B.TO_M2 * 1000, to: 'M2' as const }] : []), ...(m.to_ep ? [{ id: B.TO_EP * 1000, to: 'EP' as const }] : [])];
                const ids = new Set([...actions.map((a) => a.id), ...next.map((n) => n.id)]);
                return q({ kind: 'actions', phase: 'battle', actions, next }, (a) => {
                    const id = choice(a);
                    if (id === null || !ids.has(id)) return null;
                    const action = Math.floor(id / 1000) as B;
                    return { type: R.SELECT_BATTLECMD, action, index: action === B.TO_M2 || action === B.TO_EP ? null : id % 1000 };
                });
            }
            case M.SELECT_CHAIN: {
                const options = m.selects.map((c, i) => {
                    const r = this.ref(c, i, team);
                    const text = describe(c.description);
                    return { id: i, uid: r.uid, code: this.show(c.code), where: r.where, ...(text ? { text } : {}) };
                });
                const pass = m.forced ? null : 1 << 20;
                // A window is worth asking about only to answer your rival. With a chain, that's when its
                // newest link is theirs. Without one: never on your own turn (cards you can use on your own
                // turn are offered as actions, like an attack), and on theirs only after their play, when
                // the engine flags a card of yours as made for the moment (spe_count: Trap Hole on a summon).
                // Optional triggers ("you can...") are asked separately, so none is lost by passing here.
                const top = this.chain[this.chain.length - 1];
                const quiet = !m.forced && (top ? top.team === team : this.turnPlayer === team || m.spe_count === 0 || this.lastActor === team);
                return q({ kind: 'chain', forced: m.forced, options, pass, ...(quiet ? { quiet } : {}) }, (a) => {
                    const id = choice(a);
                    if (id === null) return null;
                    if (id === pass) return { type: R.SELECT_CHAIN, index: null };
                    return id >= 0 && id < options.length ? { type: R.SELECT_CHAIN, index: id } : null;
                });
            }
            case M.SELECT_CARD:
            case M.SELECT_TRIBUTE: {
                const tribute = m.type === M.SELECT_TRIBUTE;
                const cards = m.selects.map((c, i) => this.ref(c, i, team));
                const title = tribute ? `Choose ${m.min === m.max ? m.min : `${m.min} to ${m.max}`} monster${m.max > 1 ? 's' : ''} to Tribute` : this.hintTitle(m.min, m.max);
                return q({ kind: 'cards', title, min: m.min, max: m.max, cancel: m.can_cancel, cards, ...(tribute ? { tribute } : {}) }, (a) => {
                    if (a.kind === 'cancel') return m.can_cancel ? (tribute ? { type: R.SELECT_TRIBUTE, indicies: null } : { type: R.SELECT_CARD, indicies: null }) : null;
                    // Tribute counts in "release" units; the engine checks the total and asks again if it's wrong.
                    const ids = inRange(many(a), cards.length, tribute ? 1 : m.min, m.max);
                    if (!ids) return null;
                    return tribute ? { type: R.SELECT_TRIBUTE, indicies: ids } : { type: R.SELECT_CARD, indicies: ids };
                });
            }
            case M.SELECT_UNSELECT_CARD: {
                const cards = m.select_cards.map((c, i) => this.ref(c, i, team));
                const chosen = m.unselect_cards.map((c, i) => this.ref(c, m.select_cards.length + i, team));
                return q({ kind: 'cards', title: this.hintTitle(m.min, m.max), min: m.min, max: m.max, cancel: m.can_cancel, cards, step: { chosen, canFinish: m.can_finish } }, (a) => {
                    if (a.kind === 'done') return m.can_finish ? { type: R.SELECT_UNSELECT_CARD, index: null } : null;
                    if (a.kind === 'cancel') return m.can_cancel ? { type: R.SELECT_UNSELECT_CARD, index: null } : null;
                    const id = choice(a);
                    return id !== null && id >= 0 && id < cards.length + chosen.length ? { type: R.SELECT_UNSELECT_CARD, index: id } : null;
                });
            }
            case M.SELECT_SUM: {
                const all = [...m.selects_must, ...m.selects];
                const cards = all.map((c, i) => this.ref(c, i, team));
                return q({ kind: 'cards', title: `Choose cards that add up to ${m.amount}`, min: m.min || 1, max: m.max || all.length, cancel: false, cards, sum: m.amount }, (a) => {
                    const ids = inRange(many(a), cards.length, 1, cards.length);
                    return ids ? { type: R.SELECT_SUM, indicies: ids } : null;
                });
            }
            case M.SELECT_EFFECTYN:
            case M.SELECT_YESNO: {
                const code = m.type === M.SELECT_EFFECTYN ? m.code : undefined;
                // The engine's own question templates ("Activate the Trigger Effect of "%ls" from [%ls]?")
                // read better in plain words; a card's own question text is kept as written.
                const own = describe(m.description);
                const text = own && !own.includes('%ls') ? own : code ? `Activate the effect of ${this.engine.name(code)}?` : own ? own.replace(/\[?%ls\]?/g, '') : 'Yes or no?';
                return q({ kind: 'yesno', title: text, ...(code ? { code: this.show(code) } : {}) }, (a) => {
                    const id = choice(a);
                    if (id !== 0 && id !== 1) return null;
                    return m.type === M.SELECT_EFFECTYN ? { type: R.SELECT_EFFECTYN, yes: id === 1 } : { type: R.SELECT_YESNO, yes: id === 1 };
                });
            }
            case M.SELECT_OPTION: {
                const options = m.options.map((d, i) => ({ id: i, text: describe(d) ?? `Option ${i + 1}` }));
                return q({ kind: 'option', title: 'Choose an effect', options }, (a) => {
                    const id = choice(a);
                    return id !== null && id >= 0 && id < options.length ? { type: R.SELECT_OPTION, index: id } : null;
                });
            }
            case M.SELECT_POSITION: {
                const options = [P.FACEUP_ATTACK, P.FACEDOWN_ATTACK, P.FACEUP_DEFENSE, P.FACEDOWN_DEFENSE].filter((p) => m.positions & p).map((p) => ({ id: p, label: POSITION_LABEL[p]! }));
                return q({ kind: 'position', code: this.show(m.code), options }, (a) => {
                    const id = choice(a);
                    return id !== null && options.some((o) => o.id === id) ? { type: R.SELECT_POSITION, position: id as P } : null;
                });
            }
            case M.ANNOUNCE_NUMBER: {
                const options = m.options.map((v, i) => ({ id: i, label: String(v) }));
                return q({ kind: 'number', title: 'Declare a number', options }, (a) => {
                    const id = choice(a);
                    return id !== null && id >= 0 && id < options.length ? { type: R.ANNOUNCE_NUMBER, value: id } : null;
                });
            }
            case M.ANNOUNCE_RACE:
            case M.ANNOUNCE_ATTRIB: {
                const race = m.type === M.ANNOUNCE_RACE;
                const names = race ? RACES : ATTRIBUTES;
                const available = BigInt(m.available);
                const options = names.map((label, i) => ({ id: i, label })).filter((o) => available & (1n << BigInt(o.id)));
                return q({ kind: 'declare', title: `Declare ${m.count > 1 ? m.count : 'a'} ${race ? 'Type' : 'Attribute'}${m.count > 1 ? 's' : ''}`, what: race ? 'type' : 'attribute', count: m.count, options }, (a) => {
                    const ids = many(a);
                    if (!ids || ids.length !== m.count || ids.some((i) => !options.some((o) => o.id === i))) return null;
                    return race ? { type: R.ANNOUNCE_RACE, races: ids.map((i) => 1n << BigInt(i)) as never } : { type: R.ANNOUNCE_ATTRIB, attributes: ids.map((i) => 1 << i) as never };
                });
            }
            case M.SELECT_PLACE:
            case M.SELECT_DISFIELD: {
                const disable = m.type === M.SELECT_DISFIELD;
                const zones = openZones(m.field_mask).map((bit) => {
                    const mine = bit < 16, seq = bit % 8, spell = bit % 16 >= 8;
                    const zone: PlaceZone['zone'] = !spell ? (seq >= 5 ? 'extra-monster' : 'monster') : seq === 5 ? 'field' : seq >= 6 ? 'pendulum' : 'spell';
                    // Extra Monster Zones are one shared row: as the asker sees it, the rival's are mirrored.
                    const index = zone === 'extra-monster' ? (mine ? seq - 5 : 6 - seq) : zone === 'pendulum' ? seq - 6 : zone === 'field' ? 0 : seq;
                    return { id: bit, side: (mine ? 'me' : 'opp') as Side, zone, index };
                });
                const title = disable ? `Choose ${m.count > 1 ? `${m.count} zones` : 'a zone'} to block` : `Choose ${m.count > 1 ? `${m.count} zones` : 'a zone'} for the card`;
                return q({ kind: 'place', title, count: m.count, disable, zones }, (a) => {
                    const ids = a.kind === 'many' ? a.ids : a.kind === 'choice' ? [a.id] : null;
                    if (!ids || ids.length !== m.count || new Set(ids).size !== ids.length || ids.some((id) => !zones.some((z) => z.id === id))) return null;
                    const places = ids.map((bit) => ({ player: bit < 16 ? m.player : 1 - m.player, location: bit % 16 >= 8 ? L.SZONE : L.MZONE, sequence: bit % 8 }));
                    return disable ? { type: R.SELECT_DISFIELD, places } : { type: R.SELECT_PLACE, places };
                });
            }
            case M.ANNOUNCE_CARD:
                return q({ kind: 'card-name', title: 'Declare a card name' }, (a) => {
                    if (a.kind !== 'name') return null;
                    const code = this.engine.codeByName(a.name);
                    return code ? { type: R.ANNOUNCE_CARD, card: code } : null;
                });
            default:
                return null;
        }
    }

    private hintTitle(min: number, max: number) {
        return `Choose ${min === max ? min : `${min} to ${max}`} card${max > 1 ? 's' : ''}`;
    }

    // ---- for the bot -------------------------------------------------------------------------

    /** A card's ATK, DEF and position on the field, as the engine has them now. */
    stats(c: { controller: number; location: number; sequence: number }) {
        const info = this.engine.core.duelQuery(this.handle!, { flags: STAT_FLAGS, controller: c.controller as Team, location: c.location as never, sequence: c.sequence, overlaySequence: 0 });
        return { atk: info?.attack ?? 0, def: info?.defense ?? 0, position: info?.position ?? P.FACEDOWN_DEFENSE, code: info?.code ?? 0 };
    }

    monstersOf(t: Team) {
        const row = this.engine.core.duelQueryLocation(this.handle!, { flags: STAT_FLAGS, controller: t, location: L.MZONE });
        return row.flatMap((c, sequence) => (c ? [{ sequence, atk: c.attack ?? 0, def: c.defense ?? 0, position: c.position ?? P.FACEDOWN_DEFENSE, code: c.code ?? 0 }] : []));
    }

    isMonster(code: number) {
        return this.engine.isMonster(code);
    }

    baseAttack(code: number) {
        return this.engine.baseAttack(code);
    }
}

type TeamEvent =
    | { k: 'turn'; team: Team; turn: number }
    | { k: 'phase'; phase: Phase }
    | { k: 'draw'; team: Team; count: number }
    | { k: 'shuffle'; team: Team }
    | { k: 'summon'; team: Team; code: number; how: 'normal' | 'special' | 'flip' }
    | { k: 'set'; team: Team }
    | { k: 'activate'; team: Team; code: number; uid?: string; link: number }
    | { k: 'resolved'; link: number }
    | { k: 'negated'; link: number }
    | { k: 'attack'; team: Team; attacker?: string; target?: string }
    | { k: 'destroyed'; uid: string; code: number }
    | { k: 'move'; uid: string; code: number; team: Team; from: Zone; to: Zone; public: boolean }
    | { k: 'reposition'; uid: string; code: number; public: boolean }
    | { k: 'damage' | 'pay' | 'recover'; team: Team; amount: number }
    | { k: 'win'; team: Team | null; reason: string };

/** The zones a placement mask leaves open (a set bit is a blocked zone), as bit numbers. */
function openZones(mask: number): number[] {
    const out = [];
    for (const base of [0, 8, 16, 24]) for (let seq = 0; seq < 8; seq++) if (!(mask & (1 << (base + seq)))) out.push(base + seq);
    return out;
}

/** The first open zone, nearest the middle, as players usually place cards. A set bit is a blocked zone. */
function freePlace(mask: number, player: number) {
    const order = [2, 1, 3, 0, 4, 5, 6, 7];
    for (const base of [0, 8, 16, 24]) {
        for (const seq of order) {
            const bit = base + seq;
            if (!(mask & (1 << bit))) {
                return { bit, place: { player: base >= 16 ? 1 - player : player, location: base % 16 === 0 ? L.MZONE : L.SZONE, sequence: seq } };
            }
        }
    }
    throw new Error('No open zone to place a card');
}
