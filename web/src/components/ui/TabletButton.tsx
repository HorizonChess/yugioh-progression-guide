import { ReactNode } from "react";

/**
 * A small slanted lacquer tablet with a gold edge, like the main menu's entries: the button for
 * confirming a pick in a card close-up. It leans further and slides out on hover or press.
 */
export default function TabletButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
    return (
        <button type="button" className="tablet-btn" onClick={onClick}>
            <span className="tablet-btn__words">{children}</span>
        </button>
    );
}
