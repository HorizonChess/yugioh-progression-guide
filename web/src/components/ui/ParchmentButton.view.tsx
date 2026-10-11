import React from 'react';

interface ParchmentButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    className?: string;
    isActive?: boolean;
}

export default function ParchmentButton({ children, className = "", isActive = false, ...props }: ParchmentButtonProps) {
    return (
        <button
            {...props}
            className={`py-2 px-4 rounded-xl font-bold transition-all text-sm shadow-md border-b-4 active:border-b-0 active:translate-y-[4px] parchment-bg border-wood-border opacity-100 hover:brightness-95
            ${isActive ? 'ring-2 ring-white shadow-[0_0_15px_rgba(255,255,255,0.6)] scale-105 z-10' : ''}
            ${className}`}
        >
            {children}
        </button>
    );
}
