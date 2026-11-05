/**
 * The timeline hands its pack to the pack screen: where the pack art sat when the
 * player tapped it (or OPEN PACKS), so the pack screen can fly it from there to
 * centre stage instead of cutting to it.
 */
const KEY = "ygo-pack-flight";
const FRESH_MS = 10000; // the pack screen may wait on the set's card list first

type Flight = { index: number; at: number; rect: { left: number; top: number; width: number; height: number } };

/** Remembers where set `index`'s pack art is on screen right now. */
export function recordFlight(index: number) {
    const art = document.querySelector(`#set-${index} .timeline-node__art, #set-${index} .road-stop__art`);
    if (!art) return;
    const { left, top, width, height } = art.getBoundingClientRect();
    try {
        sessionStorage.setItem(KEY, JSON.stringify({ index, at: Date.now(), rect: { left, top, width, height } } satisfies Flight));
    } catch {
        /* no storage: the pack screen just fades in */
    }
}

/** The rect set `index`'s pack is flying from, once, if the player just tapped it. */
export function takeFlight(index: number): Flight["rect"] | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        const f = raw ? (JSON.parse(raw) as Flight) : null;
        return f && f.index === index && Date.now() - f.at < FRESH_MS ? f.rect : null;
    } catch {
        return null;
    }
}
