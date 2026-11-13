import { resolvePrizeKind, type PrizeId } from "@/lib/rewards";

/*
 * The relics on the rewards altar: one drawn object per prize kind, as SVG
 * markup (our own fixed strings, rendered with dangerouslySetInnerHTML). Parts
 * that move when a reward is claimed carry a class (.lid, .flap, .seal, .spin)
 * that rewards.css animates under .rw-opening.
 */

const G = (id: string, a: string, b: string, c: string) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
let uid = 0; // gradient ids must be unique on the page

/** A banded chest whose lid lifts. */
const chest = (tint = "#e0b54f") => {
    const u = ++uid;
    return `<svg class="rw-relic" viewBox="0 0 120 120" aria-hidden="true"><defs>${G("w" + u, "#8a4b24", "#5a2c12", "#3a1a08")}${G("g" + u, "#fff1bf", tint, "#7a5214")}</defs>
        <rect x="14" y="58" width="92" height="46" rx="4" fill="url(#w${u})" stroke="#2a1006" stroke-width="2"/>
        <rect x="14" y="58" width="92" height="9" fill="url(#g${u})"/><rect x="30" y="58" width="9" height="46" fill="url(#g${u})"/><rect x="81" y="58" width="9" height="46" fill="url(#g${u})"/>
        <rect x="52" y="64" width="16" height="18" rx="3" fill="url(#g${u})" stroke="#3a2405"/><circle cx="60" cy="72" r="2.6" fill="#2a1006"/>
        <g class="lid"><path d="M14 58 V44 Q60 18 106 44 V58 Z" fill="url(#w${u})" stroke="#2a1006" stroke-width="2"/>
        <path d="M30 58 V35 Q34 33 39 31.5 V58 Z M81 58 V31.5 Q86 33 90 35 V58Z" fill="url(#g${u})"/><path d="M14 52 Q60 28 106 52 V58 H14Z" fill="url(#g${u})" opacity=".9"/></g></svg>`;
};

/** A face-down card in an envelope, sealed with wax in the rarity's colour. */
const wild = (seal: string) => {
    const u = ++uid;
    return `<svg class="rw-relic" viewBox="0 0 120 120" aria-hidden="true"><defs>${G("p" + u, "#f6ebcd", "#e8d5aa", "#cdb07a")}<radialGradient id="s${u}"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".35" stop-color="${seal}"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient></defs>
        <rect x="22" y="22" width="76" height="86" rx="5" fill="#3a1a08"/><rect x="28" y="28" width="64" height="74" rx="3" fill="none" stroke="#e0b54f" stroke-width="2" opacity=".8"/>
        <rect x="16" y="46" width="88" height="62" rx="4" fill="url(#p${u})" stroke="#8a6420" stroke-width="1.5"/>
        <path class="flap" d="M16 46 L60 82 L104 46 Z" fill="#d9c08a" stroke="#8a6420" stroke-width="1.5"/>
        <g class="seal"><circle cx="60" cy="80" r="13" fill="url(#s${u})" stroke="#1a0a04" stroke-width="1"/><path d="M53 80 l5 5 l9 -11" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2.4" stroke-linecap="round"/></g></svg>`;
};

/** A star medallion, for the Starlight wildcard. */
const star = () => {
    const u = ++uid;
    return `<svg class="rw-relic" viewBox="0 0 120 120" aria-hidden="true"><defs><radialGradient id="r${u}" cx=".4" cy=".35"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#d3fbff"/><stop offset=".75" stop-color="#ffd3f3"/><stop offset="1" stop-color="#8a6aff"/></radialGradient></defs>
        <circle cx="60" cy="60" r="44" fill="#14102a" stroke="#e0b54f" stroke-width="4"/><circle cx="60" cy="60" r="36" fill="none" stroke="#e0b54f" stroke-dasharray="2 5" opacity=".7"/>
        <path class="spin" d="M60 22 L68 52 L98 60 L68 68 L60 98 L52 68 L22 60 L52 52 Z" fill="url(#r${u})"/>
        ${[[30, 30], [92, 34], [88, 90], [32, 88]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#fff"/>`).join("")}</svg>`;
};

/** A decree with a red wax seal (ban), or a broken one (unban). */
const decree = (broken: boolean) => {
    const u = ++uid;
    return `<svg class="rw-relic" viewBox="0 0 120 120" aria-hidden="true"><defs>${G("p" + u, "#f6ebcd", "#e8d5aa", "#c9aa6e")}</defs>
        <rect x="26" y="20" width="68" height="82" fill="url(#p${u})" stroke="#8a6420" stroke-width="1.5"/>
        <rect x="18" y="14" width="84" height="12" rx="6" fill="#b58a2e" stroke="#5a3d08"/><rect x="18" y="96" width="84" height="12" rx="6" fill="#b58a2e" stroke="#5a3d08"/>
        ${[38, 46, 54, 62].map((y) => `<path d="M36 ${y} H84" stroke="#8a6420" stroke-width="2" opacity=".45"/>`).join("")}
        <g class="seal">${broken
            ? `<path d="M50 74 a12 12 0 0 1 10 -8 l-3 8 l5 4 l-4 9 a12 12 0 0 1 -8 -13Z" fill="#8a1c10"/><path d="M64 66 a12 12 0 0 1 8 18 l-6 -2 l2 -7 l-6 -3Z" fill="#8a1c10"/>`
            : `<circle cx="60" cy="78" r="13" fill="#9b1c12" stroke="#4a0806"/><path d="M54 72 L66 84 M66 72 L54 84" stroke="rgba(255,220,200,.8)" stroke-width="3" stroke-linecap="round"/>`}</g>
        <path d="M54 90 l-4 14 l6 -4 l4 6 l2 -16" fill="#9b1c12" opacity="${broken ? 0 : 1}"/></svg>`;
};

/** A golden wheel token. */
const wheel = () => {
    const u = ++uid;
    const seg = (i: number) => {
        const a = (i * Math.PI) / 4, b = ((i + 1) * Math.PI) / 4, p = (t: number) => `${(60 + 38 * Math.cos(t)).toFixed(2)} ${(60 + 38 * Math.sin(t)).toFixed(2)}`;
        return `<path d="M60 60 L${p(a)} A38 38 0 0 1 ${p(b)} Z" fill="${["#9b1c12", "#1f4f8a", "#2e7a3c", "#5b2a86"][i % 4]}" stroke="#e0b54f" stroke-width="1.5"/>`;
    };
    return `<svg class="rw-relic" viewBox="0 0 120 120" aria-hidden="true"><defs>${G("g" + u, "#fff1bf", "#e0b54f", "#7a5214")}</defs>
        <circle cx="60" cy="60" r="46" fill="url(#g${u})" stroke="#3a2405" stroke-width="2"/><g class="spin">${Array.from({ length: 8 }, (_, i) => seg(i)).join("")}</g>
        <circle cx="60" cy="60" r="9" fill="url(#g${u})" stroke="#3a2405"/><path d="M60 8 L54 20 H66 Z" fill="#fff1bf" stroke="#3a2405"/></svg>`;
};

/** A reaching golden hand, for Snatch Steal. */
const hand = () => {
    const u = ++uid;
    return `<svg class="rw-relic" viewBox="0 0 120 120" aria-hidden="true"><defs>${G("g" + u, "#fff1bf", "#e0b54f", "#7a5214")}</defs>
        <rect x="58" y="24" width="38" height="54" rx="4" fill="#3a1a08" stroke="#e0b54f" stroke-width="2" transform="rotate(12 77 51)"/>
        <path d="M18 92 C22 76 30 66 40 62 L40 40 a5 5 0 0 1 10 0 L50 58 L52 34 a5 5 0 0 1 10 0 L61 58 L65 38 a5 5 0 0 1 10 1 L71 62 L78 50 a5 5 0 0 1 9 4 L76 78 C70 92 56 100 40 100 Z" fill="url(#g${u})" stroke="#3a2405" stroke-width="2" stroke-linejoin="round"/></svg>`;
};

/** The Redoer ticket. */
const ticket = () => {
    const u = ++uid;
    return `<svg class="rw-relic" viewBox="0 0 120 120" aria-hidden="true"><defs>${G("g" + u, "#fff1bf", "#e0b54f", "#7a5214")}</defs>
        <path d="M14 38 H106 V52 a8 8 0 0 0 0 16 V82 H14 V68 a8 8 0 0 0 0 -16Z" fill="url(#g${u})" stroke="#3a2405" stroke-width="2" transform="rotate(-8 60 60)"/>
        <g transform="rotate(-8 60 60)"><path d="M80 40 V80" stroke="#3a2405" stroke-dasharray="3 3"/><text x="46" y="65" text-anchor="middle" font-family="Georgia, serif" font-weight="800" font-size="13" fill="#3a2405">REDO</text>
        <path d="M89 54 a7 7 0 1 1 -2 9" fill="none" stroke="#3a2405" stroke-width="2.4"/><path d="M85 62 l3 3 l3 -4" fill="none" stroke="#3a2405" stroke-width="2"/></g></svg>`;
};

/** The padlock over a reward you can't claim here. */
export const LOCK = `<svg class="rw-lock" viewBox="0 0 40 48" aria-hidden="true"><path d="M10 22V14a10 10 0 0 1 20 0v8" fill="none" stroke="#c9c2b4" stroke-width="5"/><rect x="4" y="21" width="32" height="25" rx="4" fill="#9c958a" stroke="#2b2722" stroke-width="1.5"/><circle cx="20" cy="31" r="3.5" fill="#2b2722"/><rect x="18.5" y="32" width="3" height="8" rx="1" fill="#2b2722"/></svg>`;

/** Wax colours by wildcard rarity, matching the rarity colours elsewhere. */
const SEAL: Partial<Record<PrizeId, string>> = {
    "wildcard-common": "#a99d80",
    "wildcard-rare": "#cdd8ff",
    "wildcard-super": "#4fc3ff",
    "wildcard-ultra": "#ffcc33",
    "wildcard-ultimate-secret": "#ff6ad5",
};

/** The relic for a prize, as SVG markup. */
export function relicFor(prizeId: PrizeId): string {
    switch (resolvePrizeKind(prizeId)) {
        case "pity": return chest("#c9c2b4");
        case "tournament": return chest();
        case "wildcard": return wild(SEAL[prizeId] ?? "#e0b54f");
        case "starlight": return star();
        case "ban": return decree(false);
        case "unban": return decree(true);
        case "spin": return wheel();
        case "snatch": return hand();
        case "redoer": return ticket();
    }
}

const RARITY_WORDS: Partial<Record<PrizeId, string>> = {
    "wildcard-rare": "Rare",
    "wildcard-super": "Super Rare",
    "wildcard-ultra": "Ultra Rare",
    "wildcard-ultimate-secret": "Ultimate or Secret Rare",
};

/** What a prize does, in a sentence. */
export function prizeDoes(prizeId: PrizeId, redoerNote: string): string {
    switch (resolvePrizeKind(prizeId)) {
        case "pity": return "Three packs of the set you just finished, for the match you lost.";
        case "tournament": return "Three packs of the latest tournament set released before this one.";
        case "wildcard": return prizeId === "wildcard-common" ? "Pick any Common from the pack you won." : `Pick any card of ${RARITY_WORDS[prizeId]} or below from the pack you won.`;
        case "starlight": return "Any card released up to this pack (its own cards too), as a Starlight Rare.";
        case "ban": return "Name a card neither of you can put in a deck.";
        case "unban": return "Lift one ban.";
        case "spin": return "A spin of the Winner's Wheel.";
        case "snatch": return "Copy a card from your rival's binder. They keep theirs.";
        case "redoer": return redoerNote;
    }
}
