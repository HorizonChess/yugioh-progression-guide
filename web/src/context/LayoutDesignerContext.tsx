"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LayoutDesignerContextType {
    isDesignerMode: boolean;
    toggleDesignerMode: () => void;
    scaleFactor: number;
    setScaleFactor: (scale: number) => void;
}

const LayoutDesignerContext = createContext<LayoutDesignerContextType | undefined>(undefined);

export function LayoutDesignerProvider({ children }: { children: ReactNode }) {
    const [isDesignerMode, setIsDesignerMode] = useState(false);
    const [scaleFactor, setScaleFactor] = useState(1);

    const toggleDesignerMode = () => setIsDesignerMode(prev => !prev);

    return (
        <LayoutDesignerContext.Provider value={{ isDesignerMode, toggleDesignerMode, scaleFactor, setScaleFactor }}>
            {children}
        </LayoutDesignerContext.Provider>
    );
}

export function useLayoutDesignerContext() {
    const context = useContext(LayoutDesignerContext);
    if (context === undefined) {
        throw new Error('useLayoutDesignerContext must be used within a LayoutDesignerProvider');
    }
    return context;
}
