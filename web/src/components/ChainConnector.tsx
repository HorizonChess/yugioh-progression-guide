import React from 'react';

interface ChainConnectorProps {
    active?: boolean;
    className?: string;
}

export default function ChainConnector({ active = false, className = "" }: ChainConnectorProps) {
    return (
        <div className={`relative w-16 h-8 flex items-center justify-center ${className}`}>
            <svg width="100%" height="100%" viewBox="0 0 64 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg">
                <defs>
                    <linearGradient id="metal-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#9CA3AF" />
                        <stop offset="50%" stopColor="#F3F4F6" />
                        <stop offset="100%" stopColor="#4B5563" />
                    </linearGradient>
                    <linearGradient id="gold-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#FCD34D" />
                        <stop offset="50%" stopColor="#FFFBEB" />
                        <stop offset="100%" stopColor="#B45309" />
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                {/* Chain Link 1 (Left) */}
                <path
                    d="M4 16 C4 10 10 6 16 6 H24 C30 6 36 10 36 16 C36 22 30 26 24 26 H16 C10 26 4 22 4 16 Z"
                    fill="none"
                    stroke={active ? "url(#gold-gradient)" : "url(#metal-gradient)"}
                    strokeWidth="6"
                    filter={active ? "url(#glow)" : ""}
                />

                {/* Chain Link 2 (Right - Interlocking) */}
                <path
                    d="M28 16 C28 10 34 6 40 6 H48 C54 6 60 10 60 16 C60 22 54 26 48 26 H40 C34 26 28 22 28 16 Z"
                    fill="none"
                    stroke={active ? "url(#gold-gradient)" : "url(#metal-gradient)"}
                    strokeWidth="6"
                    filter={active ? "url(#glow)" : ""}
                />

                {/* Highlights for 3D effect */}
                <path d="M16 9 H24" stroke="white" strokeWidth="2" strokeOpacity="0.5" strokeLinecap="round" />
                <path d="M40 9 H48" stroke="white" strokeWidth="2" strokeOpacity="0.5" strokeLinecap="round" />
            </svg>
        </div>
    );
}
