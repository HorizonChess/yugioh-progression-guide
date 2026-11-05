import type { Card, PulledCard } from "@/lib/api";
import type { Tier } from "./fx";

/** A pulled card as the stage shows it. `owned` is how many the player had before this one. */
export type StageCard = {
    card: Card;
    image: string;
    tier: Tier;
    rarity: string;
    code: string;
    owned: number;
};

export const TIER_LABEL: Record<Tier, string> = { Common: "Common", Rare: "Rare", Super: "Super Rare", Ultra: "Ultra Rare", Secret: "Secret Rare" };

/** Groups the printed rarities into the five reveal tiers (Short Prints count as commons). */
export function tierOf(rarity: string): Tier {
    const r = rarity.toLowerCase();
    if (r.includes("secret") || r.includes("ghost") || r.includes("starlight") || r.includes("platinum")) return "Secret";
    if (r.includes("ultra") || r.includes("ultimate")) return "Ultra";
    if (r.includes("super")) return "Super";
    if (r === "rare") return "Rare";
    return "Common";
}

export function toStageCard(card: PulledCard, owned: number): StageCard {
    const rarity = card.pulled_rarity || "Common";
    return { card, image: card.card_images[0]?.image_url ?? "", tier: tierOf(rarity), rarity, code: card.pulled_set_code ?? "", owned };
}

const ATTR: Record<string, [string, string]> = {
    LIGHT: ["光", "#d9a400"], DARK: ["闇", "#5b2a86"], EARTH: ["地", "#7a5527"], WATER: ["水", "#1f6fc0"],
    FIRE: ["炎", "#d23a1e"], WIND: ["風", "#2e9a3c"], DIVINE: ["神", "#b8892a"],
};

const kindOf = (c: Card) => {
    if (c.type.startsWith("Spell")) return "Spell";
    if (c.type.startsWith("Trap")) return "Trap";
    if (c.frameType === "fusion") return "Fusion";
    if (c.frameType === "ritual") return "Ritual";
    return c.type.includes("Effect") || c.frameType === "effect" ? "Effect" : "Normal";
};

const text = (tag: string, cls: string, value: string) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = value;
    return el;
};

/** The details for `s`, laid out like the card: name plate, stars, text box, then set code and ownership. */
export function plate(s: StageCard, extra = "") {
    const c = s.card, kind = kindOf(c), monster = c.type.includes("Monster");
    const el = document.createElement("div");
    el.className = `ps-plate ps-plate--${kind} ${extra}`;
    el.dataset.tier = s.tier;

    const [kanji, colour] = monster ? ATTR[c.attribute ?? ""] ?? ["?", "#6b6256"] : kind === "Spell" ? ["魔", "#1a8d7d"] : ["罠", "#a33b7c"];
    const name = document.createElement("div");
    name.className = "ps-plate__name";
    const attr = text("span", "ps-attr", kanji);
    attr.style.setProperty("--ac", colour);
    name.append(text("h3", "", c.name), attr);

    const sub = document.createElement("div");
    sub.className = "ps-plate__sub";
    if (monster) for (let i = 0; i < (c.level ?? c.rank ?? 0); i++) sub.append(text("span", "ps-lv", "★"));
    else sub.textContent = `[${kind} Card${c.race && c.race !== "Normal" ? " · " + c.race : ""}]`;

    const box = document.createElement("div");
    box.className = "ps-plate__box";
    if (monster) {
        box.append(text("div", "ps-tl", `[${c.race}/${c.type.replace(" Monster", "").replace(/ /g, "/")}]`));
        box.append(text("p", kind === "Normal" ? "ps-flavor" : "", c.desc));
        box.append(text("div", "ps-plate__stats", `ATK/${c.atk ?? "?"}  DEF/${c.def ?? "?"}`));
    } else {
        box.append(text("p", "", c.desc));
    }

    const foot = document.createElement("div");
    foot.className = "ps-plate__foot";
    foot.append(text("span", "", [s.code, s.rarity].filter(Boolean).join(" · ")));
    foot.append(s.owned === 0 ? text("span", "ps-stamp-new", "New") : text("span", "", `Owned ×${s.owned + 1}`));

    el.append(name, sub, box, foot);
    return el;
}
