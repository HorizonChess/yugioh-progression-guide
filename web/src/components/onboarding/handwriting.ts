import gsap from "gsap";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

const rand = gsap.utils.random;

/** How long the pen spends on one character: capitals and wide letters take longer, thin marks are quick. */
function strokeTime(ch: string) {
    if (/[A-Z]/.test(ch)) return rand(0.12, 0.18);
    if (/[mwMW]/.test(ch)) return rand(0.09, 0.12);
    if (/[iljtfr.,!'’-]/.test(ch)) return rand(0.035, 0.055);
    return rand(0.055, 0.085);
}

const HIDDEN = "inset(-40% 100% -40% -25%)";
const SHOWN = "inset(-40% -25% -40% -25%)";

/**
 * Writes each line into `tl` one character at a time, at an uneven, human pace: a word comes out in one
 * burst (slower into the first letter and out of the last), the pen lifts between words, and travels a
 * varied moment to each new line. A smaller hand writes faster (`pace` below 1). Returns when the writing ends.
 */
export function handwrite(tl: gsap.core.Timeline, lines: HTMLElement[], start: number, pace = 1): number {
    let t = start;
    lines.forEach((line, l) => {
        if (l) t += rand(0.14, 0.28);
        const { words } = SplitText.create(line, { type: "words,chars", charsClass: "ob-char" });
        (words as HTMLElement[]).forEach((word, w) => {
            if (w) t += rand(0.04, 0.12) * pace;
            const chars = Array.from(word.querySelectorAll<HTMLElement>(".ob-char"));
            chars.forEach((char, c) => {
                const ease = c === 0 ? 1.25 : c === chars.length - 1 ? 1.15 : 1;
                const d = strokeTime(char.textContent ?? "") * ease * pace;
                tl.fromTo(char, { clipPath: HIDDEN }, { clipPath: SHOWN, duration: d, ease: "sine.inOut" }, t);
                t += d * rand(0.72, 0.88);
            });
        });
    });
    return t;
}
