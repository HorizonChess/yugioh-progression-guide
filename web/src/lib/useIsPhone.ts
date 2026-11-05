import { useSyncExternalStore } from "react";

/** Phones get their own layouts below Tailwind's `md` breakpoint (768px). */
const QUERY = "(max-width: 767px)";

const subscribe = (onChange: () => void) => {
    const mq = window.matchMedia(QUERY);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
};

/** True on a phone-width screen; false during the static prerender. */
export function useIsPhone() {
    return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
