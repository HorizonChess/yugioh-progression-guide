import { useSyncExternalStore } from "react";

/** Phones get their own layouts below Tailwind's `md` breakpoint (768px). */
const QUERY = "(max-width: 767px)";

// Some environments (tests, very old browsers) have no matchMedia: treat them as wide.
const hasMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

const subscribe = (onChange: () => void) => {
    if (!hasMedia()) return () => undefined;
    const mq = window.matchMedia(QUERY);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
};

/** True on a phone-width screen; false during the static prerender. */
export function useIsPhone() {
    return useSyncExternalStore(subscribe, () => hasMedia() && window.matchMedia(QUERY).matches, () => false);
}
