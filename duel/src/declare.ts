import type { Engine } from './engine';

/*
 * Which cards may be declared when the engine asks for a card name (ANNOUNCE_CARD). The question
 * carries a filter: a little stack program of OPCODE_* values (constant.lua) that ocgcore runs on
 * each card (`is_declarable`). Prohibition's says "any card", others "a monster card" or "a card of
 * this Type". A card outside it is refused, and the bot must never name one.
 */

const OP = 0x4000000000000000n;
const TYPE_TOKEN = 0x4000;

/** Whether `code` may be declared under the filter `opcodes`. */
export function declarable(engine: Engine, code: number, opcodes: readonly (bigint | number | string)[]): boolean {
    const card = engine.cardData(code);
    if (!card) return false;
    const setcodes = card.setcodes;
    const isSet = (v: number) => setcodes.some((s) => (s & 0xfff) === (v & 0xfff) && (s & v) === v);
    const stack: bigint[] = [];
    let aliases = false, tokens = false;
    const pop = () => stack.pop() ?? 0n;
    const two = (f: (a: bigint, b: bigint) => bigint) => {
        const b = pop(), a = pop();
        stack.push(f(a, b));
    };
    for (const raw of opcodes) {
        const op = BigInt(raw);
        if ((op & 0xc000000000000000n) !== OP) {
            stack.push(op);
            continue;
        }
        switch (op) {
            case 0x4000000000000000n: two((a, b) => a + b); break;
            case 0x4000000100000000n: two((a, b) => a - b); break;
            case 0x4000000200000000n: two((a, b) => a * b); break;
            case 0x4000000300000000n: two((a, b) => (b ? a / b : 0n)); break;
            case 0x4000000400000000n: two((a, b) => (a && b ? 1n : 0n)); break;
            case 0x4000000500000000n: two((a, b) => (a || b ? 1n : 0n)); break;
            case 0x4000000600000000n: stack.push(-pop()); break;
            case 0x4000000700000000n: stack.push(pop() ? 0n : 1n); break;
            case 0x4000000800000000n: two((a, b) => a & b); break;
            case 0x4000000900000000n: two((a, b) => a | b); break;
            case 0x4000001000000000n: stack.push(~pop()); break;
            case 0x4000001100000000n: two((a, b) => a ^ b); break;
            case 0x4000001200000000n: two((a, b) => a << b); break;
            case 0x4000001300000000n: two((a, b) => a >> b); break;
            case 0x4000001400000000n: aliases = true; break;
            case 0x4000001500000000n: tokens = true; break;
            case 0x4000010000000000n: { const v = pop(); stack.push(BigInt(code) === v || BigInt(card.alias) === v ? 1n : 0n); break; }
            case 0x4000010100000000n: stack.push(isSet(Number(pop())) ? 1n : 0n); break;
            case 0x4000010200000000n: stack.push(BigInt(card.type) & pop() ? 1n : 0n); break;
            case 0x4000010300000000n: stack.push(BigInt(card.race) & pop() ? 1n : 0n); break;
            case 0x4000010400000000n: stack.push(BigInt(card.attribute) & pop() ? 1n : 0n); break;
            case 0x4000010500000000n: stack.push(BigInt(code)); break;
            case 0x4000010600000000n: stack.push(BigInt(setcodes[0] ?? 0)); break;
            case 0x4000010700000000n: stack.push(BigInt(card.type)); break;
            case 0x4000010800000000n: stack.push(BigInt(card.race)); break;
            case 0x4000010900000000n: stack.push(BigInt(card.attribute)); break;
            default: stack.push(op);
        }
    }
    if (stack.length !== 1 || stack[0] === 0n) return false;
    if (!aliases && card.alias) return false;
    if (!tokens && card.type & TYPE_TOKEN) return false;
    return true;
}

/**
 * The card to declare: the first of `preferred` the filter allows, else the first card the engine
 * knows that it allows (null if none, which the engine shouldn't ask).
 */
export function declarableCard(engine: Engine, opcodes: readonly (bigint | number | string)[], preferred: readonly number[]): number | null {
    for (const code of preferred) if (declarable(engine, code, opcodes)) return code;
    for (const code of engine.codes()) if (declarable(engine, code, opcodes)) return code;
    return null;
}
