import React from 'react';

interface StonePanelProps {
    children: React.ReactNode;
    className?: string;
    title?: string;
}

export default function StonePanel({ children, className = "", title }: StonePanelProps) {
    return (
        <div className={`stone-panel p-6 ${className}`}>
            {title && (
                <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-4 drop-shadow-md">
                    {title}
                </h3>
            )}
            {children}
        </div>
    );
}
