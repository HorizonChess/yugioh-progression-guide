import React from 'react';

interface ParchmentInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    className?: string;
}

export default function ParchmentInput({ className = "", ...props }: ParchmentInputProps) {
    return (
        <input
            {...props}
            className={`parchment-bg border-2 border-wood-border rounded-xl text-ink font-bold text-lg font-serif focus:outline-none focus:border-primary shadow-inner transition-all opacity-70 focus:opacity-100 placeholder-wood-border/50 px-4 py-2 ${className}`}
        />
    );
}
