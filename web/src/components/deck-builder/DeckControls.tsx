interface DeckControlsProps {
    deckName: string;
    onDeckNameChange: (name: string) => void;
    onSave: () => void;
    onLoad: () => void;
    onClear: () => void;
    onSort: () => void;
    onImport: () => void;
    onExport: () => void;
}

/** The deck's name and its actions, under the card panel. */
export default function DeckControls({ deckName, onDeckNameChange, onSave, onLoad, onClear, onSort, onImport, onExport }: DeckControlsProps) {
    return (
        <div className="db-ctrls">
            <input value={deckName} onChange={(e) => onDeckNameChange(e.target.value)} placeholder="Deck Name" aria-label="Deck name" />
            <button onClick={onSave} className="db-btn db-btn--gold">Save Deck</button>
            <button onClick={onLoad} className="db-btn">Load Deck</button>
            <button onClick={onClear} className="db-btn">Clear Deck</button>
            <button onClick={onSort} className="db-btn">Sort</button>
            <button onClick={onImport} className="db-btn">Import</button>
            <button onClick={onExport} className="db-btn">Export</button>
        </div>
    );
}
