import React from 'react';

interface ParchmentInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    className?: string;
}

export default function ParchmentInput({ className = "", ...props }: ParchmentInputProps) {
    return (
        <input
            {...props}
            className={`parchment-bg border-2 border-[#8b7355] rounded-xl text-[#2c1810] font-bold text-lg font-serif focus:outline-none focus:border-[#d4af37] shadow-inner transition-all opacity-70 focus:opacity-100 placeholder-[#8b7355]/50 px-4 py-2 ${className}`}
        />
    );
}
