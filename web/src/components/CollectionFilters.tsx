
import { useState, useEffect } from "react";
import StonePanel from "./StonePanel";
import ParchmentInput from "./ParchmentInput";

export interface FilterState {
    search: string;
    cardType: string;
    attribute: string;
    monsterType: string;
    sort: string;
}

interface CollectionFiltersProps {
    onFilterChange: (filters: FilterState) => void;
}

const CARD_TYPES = ["All", "Monster", "Spell", "Trap"];
const ATTRIBUTES = ["All", "DARK", "LIGHT", "EARTH", "WATER", "FIRE", "WIND", "DIVINE"];
const MONSTER_TYPES = [
    "All", "Dragon", "Spellcaster", "Zombie", "Warrior", "Beast-Warrior", "Beast", "Winged Beast",
    "Fiend", "Fairy", "Insect", "Dinosaur", "Reptile", "Fish", "Sea Serpent", "Machine",
    "Thunder", "Aqua", "Pyro", "Rock", "Plant"
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

export default function CollectionFilters({ onFilterChange }: CollectionFiltersProps) {
    const [filters, setFilters] = useState<FilterState>({
        search: "",
        cardType: "All",
        attribute: "All",
        monsterType: "All",
        sort: "name_asc"
    });

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

    return (
        <StonePanel className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Search */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-[#d4af37] uppercase drop-shadow-sm">Search</label>
                    <ParchmentInput
                        type="text"
                        placeholder="Card name or description..."
                        value={filters.search}
                        onChange={(e) => handleChange('search', e.target.value)}
                        className="w-full"
                    />
                </div>

                {/* Card Type */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-[#d4af37] uppercase drop-shadow-sm">Card Type</label>
                    <select
                        value={filters.cardType}
                        onChange={(e) => handleChange('cardType', e.target.value)}
                        className="parchment-bg border-2 border-[#8b7355] rounded-xl px-4 py-2 text-[#2c1810] font-bold font-serif focus:outline-none focus:border-[#d4af37] shadow-inner transition-all opacity-70 focus:opacity-100 appearance-none cursor-pointer"
                    >
                        {CARD_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>

                {/* Attribute */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-[#d4af37] uppercase drop-shadow-sm">Attribute</label>
                    <select
                        value={filters.attribute}
                        onChange={(e) => handleChange('attribute', e.target.value)}
                        disabled={filters.cardType === "Spell" || filters.cardType === "Trap"}
                        className="parchment-bg border-2 border-[#8b7355] rounded-xl px-4 py-2 text-[#2c1810] font-bold font-serif focus:outline-none focus:border-[#d4af37] shadow-inner transition-all opacity-70 focus:opacity-100 appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {ATTRIBUTES.map(attr => (
                            <option key={attr} value={attr}>{attr}</option>
                        ))}
                    </select>
                </div>

                {/* Monster Type */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-[#d4af37] uppercase drop-shadow-sm">Monster Type</label>
                    <select
                        value={filters.monsterType}
                        onChange={(e) => handleChange('monsterType', e.target.value)}
                        disabled={filters.cardType === "Spell" || filters.cardType === "Trap"}
                        className="parchment-bg border-2 border-[#8b7355] rounded-xl px-4 py-2 text-[#2c1810] font-bold font-serif focus:outline-none focus:border-[#d4af37] shadow-inner transition-all opacity-70 focus:opacity-100 appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {MONSTER_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>

                {/* Sort By */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-[#d4af37] uppercase drop-shadow-sm">Sort By</label>
                    <select
                        value={filters.sort}
                        onChange={(e) => handleChange('sort', e.target.value)}
                        className="parchment-bg border-2 border-[#8b7355] rounded-xl px-4 py-2 text-[#2c1810] font-bold font-serif focus:outline-none focus:border-[#d4af37] shadow-inner transition-all opacity-70 focus:opacity-100 appearance-none cursor-pointer"
                    >
                        {SORT_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>
            </div>
        </StonePanel>
    );
}
