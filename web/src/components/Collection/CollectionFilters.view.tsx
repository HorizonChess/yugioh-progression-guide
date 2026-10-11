
import { useState, useEffect } from "react";
import StonePanel from "@/components/ui/StonePanel.view";
import ParchmentInput from "@/components/ui/ParchmentInput.view";
import { fetchAllSets, CardSet } from "@/lib/api";

export interface FilterState {
    search: string;
    set: string;
    rarity: string;
    category: string; // Monster, Spell, Trap
    cardType: string; // Normal, Effect, Fusion, etc.
    subtype: string; // Dragon, Warrior, etc.
    attribute: string;
    level: string;
    scale: string;
    atkMin: string;
    atkMax: string;
    defMin: string;
    defMax: string;
    sort: string;
}

interface CollectionFiltersProps {
    onFilterChange: (filters: FilterState) => void;
    className?: string;
    compact?: boolean;
}

const CATEGORIES = ["All", "Monster", "Spell", "Trap"];

const CARD_TYPES = [
    "All",
    "Normal Monster", "Effect Monster", "Fusion Monster", "Ritual Monster",
    "Synchro Monster", "XYZ Monster", "Link Monster", "Pendulum Monster",
    "Toon Monster", "Spirit Monster", "Union Monster", "Gemini Monster", "Tuner Monster",
    "Flip Effect Monster",
    "Normal Spell", "Continuous Spell", "Equip Spell", "Field Spell", "Quick-Play Spell", "Ritual Spell",
    "Normal Trap", "Continuous Trap", "Counter Trap"
];

const SUBTYPES = [
    "All",
    "Aqua", "Beast", "Beast-Warrior", "Creator-God", "Cyberse", "Dinosaur", "Divine-Beast", "Dragon",
    "Fairy", "Fiend", "Fish", "Insect", "Machine", "Plant", "Psychic", "Pyro", "Reptile", "Rock",
    "Sea Serpent", "Spellcaster", "Thunder", "Warrior", "Winged Beast", "Wyrm", "Zombie"
];

const ATTRIBUTES = ["All", "DARK", "LIGHT", "EARTH", "WATER", "FIRE", "WIND", "DIVINE"];
const LEVELS = ["All", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"];
const SCALES = ["All", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"];
const RARITIES = [
    "All", "Common", "Rare", "Super Rare", "Ultra Rare", "Secret Rare", "Ultimate Rare", "Ghost Rare",
    "Starfoil Rare", "Mosaic Rare", "Shatterfoil Rare", "Gold Rare", "Platinum Rare",
    "Starlight Rare", "Prismatic Secret Rare", "Collector's Rare", "Pharaoh's Rare",
    "Platinum Secret Rare", "10000 Secret Rare", "Millennium Rare"
];

const SORT_OPTIONS = [
    { label: "Name (A-Z)", value: "name_asc" },
    { label: "Name (Z-A)", value: "name_desc" },
    { label: "ATK (High-Low)", value: "atk_desc" },
    { label: "DEF (High-Low)", value: "def_desc" },
    { label: "Level (High-Low)", value: "level_desc" },
    { label: "Newest (ID High-Low)", value: "newest" },
    { label: "Oldest (ID Low-High)", value: "oldest" },
];

export default function CollectionFilters({ onFilterChange, className = "", compact = false }: CollectionFiltersProps) {
    const [filters, setFilters] = useState<FilterState>({
        search: "",
        set: "All",
        rarity: "All",
        category: "All",
        cardType: "All",
        subtype: "All",
        attribute: "All",
        level: "All",
        scale: "All",
        atkMin: "",
        atkMax: "",
        defMin: "",
        defMax: "",
        sort: "name_asc"
    });

    const [sets, setSets] = useState<CardSet[]>([]);

    useEffect(() => {
        async function loadSets() {
            const allSets = await fetchAllSets();
            setSets(allSets);
        }
        loadSets();
    }, []);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            onFilterChange(filters);
        }, 300);
        return () => clearTimeout(timer);
    }, [filters, onFilterChange]);

    const handleChange = (key: keyof FilterState, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleReset = () => {
        setFilters({
            search: "",
            set: "All",
            rarity: "All",
            category: "All",
            cardType: "All",
            subtype: "All",
            attribute: "All",
            level: "All",
            scale: "All",
            atkMin: "",
            atkMax: "",
            defMin: "",
            defMax: "",
            sort: "name_asc"
        });
    };

    return (
        <div className={`flex flex-col gap-4 w-64 ${className}`}>
            <StonePanel className="flex-1 overflow-y-auto max-h-[calc(100vh-120px)] hide-scrollbar">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-black text-white">Filters</h2>
                        <button onClick={handleReset} className="text-xs text-red-400 hover:text-red-300 underline">Reset</button>
                    </div>

                    {/* Search */}
                    <div className="flex flex-col gap-1">
                        <ParchmentInput
                            type="text"
                            placeholder="Search cards..."
                            value={filters.search}
                            onChange={(e) => handleChange('search', e.target.value)}
                            className="w-full"
                        />
                    </div>

                    {/* Filter Groups */}
                    <div className="flex flex-col gap-2">
                        <FilterGroup label="Set">
                            <FilterSelect
                                value={filters.set}
                                onChange={(val) => handleChange('set', val)}
                                options={["All", ...sets.map(s => s.set_name)]}
                            />
                        </FilterGroup>

                        <FilterGroup label="Rarity">
                            <FilterSelect
                                value={filters.rarity}
                                onChange={(val) => handleChange('rarity', val)}
                                options={RARITIES}
                            />
                        </FilterGroup>

                        <FilterGroup label="Card Category">
                            <FilterSelect
                                value={filters.category}
                                onChange={(val) => handleChange('category', val)}
                                options={CATEGORIES}
                            />
                        </FilterGroup>

                        <FilterGroup label="Type">
                            <FilterSelect
                                value={filters.cardType}
                                onChange={(val) => handleChange('cardType', val)}
                                options={CARD_TYPES}
                            />
                        </FilterGroup>

                        <FilterGroup label="Subtype">
                            <FilterSelect
                                value={filters.subtype}
                                onChange={(val) => handleChange('subtype', val)}
                                options={SUBTYPES}
                                disabled={filters.category === "Spell" || filters.category === "Trap"}
                            />
                        </FilterGroup>

                        <FilterGroup label="Attribute">
                            <FilterSelect
                                value={filters.attribute}
                                onChange={(val) => handleChange('attribute', val)}
                                options={ATTRIBUTES}
                                disabled={filters.category === "Spell" || filters.category === "Trap"}
                            />
                        </FilterGroup>

                        <FilterGroup label="Level / Rank / Link">
                            <FilterSelect
                                value={filters.level}
                                onChange={(val) => handleChange('level', val)}
                                options={LEVELS}
                                disabled={filters.category === "Spell" || filters.category === "Trap"}
                            />
                        </FilterGroup>

                        <FilterGroup label="Pendulum Scale">
                            <FilterSelect
                                value={filters.scale}
                                onChange={(val) => handleChange('scale', val)}
                                options={SCALES}
                                disabled={filters.category === "Spell" || filters.category === "Trap"}
                            />
                        </FilterGroup>

                        <FilterGroup label="ATK">
                            <div className="flex gap-2">
                                <ParchmentInput
                                    type="number"
                                    placeholder="Min"
                                    value={filters.atkMin}
                                    onChange={(e) => handleChange('atkMin', e.target.value)}
                                    className="w-full text-center"
                                />
                                <span className="text-white self-center">-</span>
                                <ParchmentInput
                                    type="number"
                                    placeholder="Max"
                                    value={filters.atkMax}
                                    onChange={(e) => handleChange('atkMax', e.target.value)}
                                    className="w-full text-center"
                                />
                            </div>
                        </FilterGroup>

                        <FilterGroup label="DEF">
                            <div className="flex gap-2">
                                <ParchmentInput
                                    type="number"
                                    placeholder="Min"
                                    value={filters.defMin}
                                    onChange={(e) => handleChange('defMin', e.target.value)}
                                    className="w-full text-center"
                                />
                                <span className="text-white self-center">-</span>
                                <ParchmentInput
                                    type="number"
                                    placeholder="Max"
                                    value={filters.defMax}
                                    onChange={(e) => handleChange('defMax', e.target.value)}
                                    className="w-full text-center"
                                />
                            </div>
                        </FilterGroup>
                    </div>

                    {/* Sort */}
                    <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-white/10">
                        <label className="text-xs font-bold text-primary uppercase drop-shadow-sm">Sort By</label>
                        <select
                            value={filters.sort}
                            onChange={(e) => handleChange('sort', e.target.value)}
                            className="parchment-bg border-2 border-wood-border rounded-xl px-4 py-2 text-ink font-bold font-serif focus:outline-none focus:border-primary shadow-inner transition-all opacity-90 focus:opacity-100 appearance-none cursor-pointer w-full"
                        >
                            {SORT_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>

                </div>
            </StonePanel>
        </div>
    );
}

function FilterGroup({ label, children }: { label: string, children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border-b border-white/10 pb-2 last:border-0">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full text-left py-1 hover:bg-white/5 rounded px-1 transition-colors"
            >
                <span className="text-xs font-bold text-primary uppercase drop-shadow-sm">{label}</span>
                <svg
                    className={`w-4 h-4 text-primary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-40 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                {children}
            </div>
        </div>
    );
}

function FilterSelect({ value, onChange, options, disabled = false }: {
    value: string,
    onChange: (val: string) => void,
    options: string[],
    disabled?: boolean
}) {
    return (
        <div className={`relative ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="parchment-bg border-2 border-wood-border rounded-xl px-3 py-1.5 pr-8 text-ink font-bold font-serif focus:outline-none focus:border-primary shadow-inner transition-all opacity-90 focus:opacity-100 appearance-none cursor-pointer w-full text-xs truncate"
            >
                {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-ink">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
        </div>
    );
}
