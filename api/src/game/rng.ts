import { randomBytes } from 'node:crypto';
import type { Rng } from '@ygo/shared';

/**
 * A cryptographically random Rng for real pulls and wheel spins: 48 random bits
 * per draw, scaled into [0, 1). 48 bits is what a double can hold exactly, and
 * stays under `crypto.randomInt`'s 2^48 range cap if we ever switch to it.
 * Players can't predict or replay it, unlike `Math.random`.
 */
export const cryptoRng: Rng = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
