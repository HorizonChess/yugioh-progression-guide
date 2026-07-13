"use client";

import React from 'react';

interface QuantitySelectorProps {
    quantity: number;
    setQuantity: (val: number) => void;
    onOpen: () => void;
}

export default function QuantitySelector({ quantity, setQuantity, onOpen }: QuantitySelectorProps) {

    const handleIncrement = () => setQuantity(quantity + 1);
    const handleDecrement = () => setQuantity(Math.max(1, quantity - 1));
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val)) setQuantity(Math.max(1, val));
    };

    return (
        <div className="w-full">
            {/* Input and Open Button Row */}
            <div className="flex gap-4 mb-4 h-14">
                {/* Custom Input Field Container */}
                <div className="flex-1 relative flex items-center group">
                    <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={handleInputChange}
                        className="w-full h-full pl-4 pr-12 parchment-bg border-2 border-wood-border rounded-xl text-ink font-bold text-xl font-serif focus:outline-none focus:border-primary shadow-inner transition-all opacity-70 focus:opacity-100 placeholder-wood-border/50"
                        style={{ MozAppearance: 'textfield' }}
                    />

                    {/* Custom Arrows Container */}
                    <div className="absolute right-2 top-2 bottom-2 w-8 flex flex-col gap-0.5 bg-wood-border/10 rounded-lg overflow-hidden border border-wood-border/20">
                        <button
                            onClick={handleIncrement}
                            className="flex-1 hover:bg-wood-border/20 text-ink flex items-center justify-center transition-colors active:bg-wood-border/40"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <div className="h-[1px] bg-wood-border/20 w-full"></div>
                        <button
                            onClick={handleDecrement}
                            className="flex-1 hover:bg-wood-border/20 text-ink flex items-center justify-center transition-colors active:bg-wood-border/40"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                    </div>

                    {/* CSS to hide default spinners */}
                    <style jsx>{`
                        input[type=number]::-webkit-inner-spin-button, 
                        input[type=number]::-webkit-outer-spin-button { 
                            -webkit-appearance: none; 
                            margin: 0; 
                        }
                    `}</style>
                </div>

                {/* Open Button - Distinct Style */}
                <button
                    onClick={onOpen}
                    className="px-8 h-full bg-primary text-black font-black rounded-xl hover:bg-primary-hover shadow-[0_4px_0_theme(colors.gold-dark)] active:shadow-none active:translate-y-[4px] transition-all border border-gold-dark uppercase tracking-wider text-lg"
                >
                    Open
                </button>
            </div>

            {/* Preset Buttons - Parchment Style */}
            <div className="grid grid-cols-4 gap-3">
                {[1, 5, 10, 24].map((val) => (
                    <button
                        key={val}
                        onClick={() => setQuantity(val)}
                        className={`py-3 rounded-xl font-bold transition-all text-sm shadow-md border-b-4 active:border-b-0 active:translate-y-[4px] parchment-bg
                            ${quantity === val
                                ? 'ring-2 ring-white shadow-[0_0_15px_rgba(255,255,255,0.6)] scale-105 border-wood-border'
                                : 'hover:brightness-95 border-wood-border'
                            }`}
                    >
                        {val}
                    </button>
                ))}
            </div>
        </div>
    );
}
