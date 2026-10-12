"use client";

export interface MenuItemData {
    label: string;
    href?: string;
    action?: () => void;
    description: string;
    disabled?: boolean;
}

/**
 * One skewed retro menu entry (label + description + hover chevron). Purely
 * presentational — the parent wraps it in a <Link> or <button>.
 */
export default function MenuItem({ item }: { item: MenuItemData }) {
    return (
        <div className={`menu-item ${item.disabled ? "menu-item--disabled" : "menu-item--active"}`}>
            <div className="skew-x-[10deg] flex justify-between items-center">
                <div>
                    <h3 className={`text-2xl font-black tracking-widest ${item.disabled ? "text-gray-500" : "text-white group-hover:text-primary"}`}>
                        {item.label}
                    </h3>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mt-1 group-hover:text-gray-300">
                        {item.description}
                    </p>
                </div>
                {!item.disabled && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-primary">▶</div>
                )}
            </div>
        </div>
    );
}
