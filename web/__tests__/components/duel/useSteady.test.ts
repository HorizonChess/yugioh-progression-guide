import { act, renderHook } from "@testing-library/react";
import { useSteady } from "@/components/duel/useSteady";

// The duel's menus must never blink between one question and the next.
type Q = { name: string; linger: boolean };
const sheet = (name: string): Q => ({ name, linger: true });

describe("useSteady", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("keeps a sheet up, inert, through the gap before the next question", () => {
        const { result, rerender } = renderHook(({ q }: { q: Q | null }) => useSteady(q, 450), { initialProps: { q: sheet("Respond?") as Q | null } });
        rerender({ q: null });
        expect(result.current).toEqual({ value: sheet("Respond?"), lingering: true });
        act(() => jest.advanceTimersByTime(300));
        expect(result.current.value?.name).toBe("Respond?");
        rerender({ q: sheet("Which position?") });
        expect(result.current).toEqual({ value: sheet("Which position?"), lingering: false });
    });

    it("lets the sheet go after a real pause", () => {
        const { result, rerender } = renderHook(({ q }: { q: Q | null }) => useSteady(q, 450), { initialProps: { q: sheet("Respond?") as Q | null } });
        rerender({ q: null });
        act(() => jest.advanceTimersByTime(460));
        expect(result.current).toEqual({ value: null, lingering: false });
    });

    it("holds through an animation of any length while the next question waits behind it", () => {
        const { result, rerender } = renderHook(({ q, hold }: { q: Q | null; hold: boolean }) => useSteady(q, 450, hold), { initialProps: { q: sheet("Activate a card?") as Q | null, hold: false } });
        rerender({ q: null, hold: true });
        act(() => jest.advanceTimersByTime(3000));
        expect(result.current).toEqual({ value: sheet("Activate a card?"), lingering: true });
        rerender({ q: sheet("Choose 1 card"), hold: false });
        expect(result.current).toEqual({ value: sheet("Choose 1 card"), lingering: false });
    });

    it("lets go once nothing is waiting any more", () => {
        const { result, rerender } = renderHook(({ q, hold }: { q: Q | null; hold: boolean }) => useSteady(q, 450, hold), { initialProps: { q: sheet("Respond?") as Q | null, hold: false } });
        rerender({ q: null, hold: true });
        act(() => jest.advanceTimersByTime(1000));
        rerender({ q: null, hold: false });
        act(() => jest.advanceTimersByTime(460));
        expect(result.current).toEqual({ value: null, lingering: false });
    });

    it("never keeps what isn't a sheet (a card's pop-over goes at once)", () => {
        const { result, rerender } = renderHook(({ q }: { q: Q | null }) => useSteady(q, 450), { initialProps: { q: { name: "pop", linger: false } as Q | null } });
        rerender({ q: null });
        expect(result.current).toEqual({ value: null, lingering: false });
    });

    it("a fresh question every render doesn't loop", () => {
        const { result, rerender } = renderHook(({ n }: { n: number }) => useSteady(sheet(`Q${n}`), 450), { initialProps: { n: 0 } });
        for (let n = 1; n < 5; n++) rerender({ n });
        expect(result.current.value?.name).toBe("Q4");
    });
});
