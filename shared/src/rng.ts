/**
 * A source of uniform random numbers in [0, 1), like `Math.random`.
 *
 * Pack opening and the wheel take one so each host picks its own: the browser
 * (guest mode) uses `Math.random`, the server a cryptographic source, and tests
 * a seeded one for reproducible pulls.
 */
export type Rng = () => number;

/**
 * A deterministic Rng from a 32-bit seed (mulberry32). Same seed, same
 * sequence — for tests and reproducible fixtures, never for real pulls.
 */
export function seededRng(seed: number): Rng {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A uniform integer in [0, max) drawn from `rng`. */
export function randomIndex(rng: Rng, max: number): number {
    return Math.floor(rng() * max);
}
