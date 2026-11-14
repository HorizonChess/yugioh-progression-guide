import type { OcgResponse } from 'ocgcore-wasm';

/*
 * A duel's answers as they're stored and sent: JSON, with bigints as {"$b": "123"}. The server
 * keeps them, and a game played on the player's device sends them to it.
 */

export const encodeAnswer = (r: OcgResponse): string => JSON.stringify(r, (_k, v: unknown) => (typeof v === 'bigint' ? { $b: v.toString() } : v));

export const decodeAnswer = (s: string): OcgResponse =>
    JSON.parse(s, (_k, v: unknown) => (v && typeof v === 'object' && '$b' in v && typeof v.$b === 'string' ? BigInt(v.$b) : v)) as OcgResponse;
