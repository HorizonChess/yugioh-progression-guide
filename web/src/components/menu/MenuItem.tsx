"use client";

export interface MenuItemData {
    label: string;
    href?: string;
    action?: () => void;
    description: string;
    disabled?: boolean;
    /** What Yugi's welcome calls this item (data-guide), to spotlight it. */
    guide?: string;
}

/**
 * One menu entry: a slanted lacquer tablet with a gold edge, its label engraved
 * above a short description; `main` gilds the first step (Campaign). Purely
 * presentational: the parent wraps it in a <Link> or <button>.
 */
export default function MenuItem({ item, main = false }: { item: MenuItemData; main?: boolean }) {
    return (
        <div className={`menu-item ${item.disabled ? "menu-item--disabled" : "menu-item--active"} ${main && !item.disabled ? "menu-item--main" : ""}`}>
            <div className="menu-item__words">
                <h3>{item.label}</h3>
                <p>{item.description}</p>
            </div>
        </div>
    );
}
