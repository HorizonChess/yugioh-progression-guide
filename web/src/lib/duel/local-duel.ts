import type { DuelMatchView, DuelOnDevice, DuelServerMessage, DuelState } from "@ygo/shared";
import { recordDeviceAnswers, type DuelConnection } from "@/lib/duel-client";
import type { FromWorker, ToWorker } from "./duel.worker";

/*
 * A practice game against the bot, played on this device (duel.worker.ts runs the engine and the
 * bot). It looks to the duel screen like the server's live socket: answers go in, states come
 * out. The answers are sent to the server to keep as the game goes; at its end, the result too.
 */

const BASE = process.env.NEXT_PUBLIC_IMAGE_HOST ?? "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function connectLocalDuel(
    duelId: string,
    device: DuelOnDevice,
    match: DuelMatchView | undefined,
    onMessage: (m: DuelServerMessage) => void,
    onError: (message: string) => void,
): DuelConnection {
    const worker = new Worker(new URL("./duel.worker.ts", import.meta.url), { type: "module" });
    const send = (m: ToWorker) => worker.postMessage(m);
    let last: DuelState | null = null;
    const show = (state: DuelState, frames: DuelServerMessage["frames"] = []) => onMessage({ type: "state", frames, state: match ? { ...state, match } : state });

    // The answers as the device has them, how many the server has kept, and from where they changed since.
    let all = [...device.answers];
    let kept = all.length;
    let changedFrom = Number.POSITIVE_INFINITY;
    let end: { winner: "me" | "opp" | null; reason: string } | undefined;
    let sending = false;
    async function upload() {
        if (sending) return;
        sending = true;
        try {
            // (Answers still on their way are sent even after the screen is left.)
            for (let failures = 0; changedFrom !== Number.POSITIVE_INFINITY || end; ) {
                const from = Math.min(kept, changedFrom), upto = all.length, ending = end;
                changedFrom = Number.POSITIVE_INFINITY;
                end = undefined;
                try {
                    const res = await recordDeviceAnswers(duelId, { from, answers: all.slice(from, upto), ...(ending ? { end: ending } : {}) });
                    kept = upto;
                    failures = 0;
                    // Booked: the match has moved on (the next game, or its result), for the screen to offer.
                    if (ending && res.match) {
                        match = res.match;
                        if (last) show(last);
                    }
                } catch {
                    changedFrom = Math.min(changedFrom, from);
                    end ??= ending;
                    if (++failures >= 5) return onError("Your answers couldn't be saved: check your connection.");
                    await sleep(1000 * 2 ** failures);
                }
            }
        } finally {
            sending = false;
        }
    }

    worker.onmessage = (event: MessageEvent<FromWorker>) => {
        const m = event.data;
        if (m.type === "state") {
            last = m.state;
            show(m.state, m.frames);
        } else if (m.type === "answers") {
            all = [...all.slice(0, m.from), ...m.answers];
            changedFrom = Math.min(changedFrom, m.from);
            if (m.end) end = m.end;
            void upload();
        } else onError(m.message);
    };
    worker.onerror = (event) => onError(event.message || "The duel engine failed to start");
    send({ type: "open", base: BASE, duelId, device });

    return {
        answer: (seq, answer) => send({ type: "answer", seq, answer }),
        back: (seq) => send({ type: "back", seq }),
        concede: () => send({ type: "concede" }),
        // Only against a rival.
        callOff: () => undefined,
        close: () => worker.terminate(),
    };
}
