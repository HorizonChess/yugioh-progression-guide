import Link from "next/link";
import { ReactNode } from "react";

interface GoldButtonProps {
    children: ReactNode;
    onClick?: () => void;
    href?: string;
    className?: string;
    width?: string;
    height?: string;
    padding?: string;
    textSize?: string;
}

export default function GoldButton({
    children,
    onClick,
    href,
    className = "",
    width = "w-80",
    height = "h-24",
    padding = "px-14",
    textSize = "text-xl"
}: GoldButtonProps) {
    const baseClasses = `${width} ${height} bg-[url('/ui/button_gold.png')] bg-[length:100%_100%] bg-center bg-no-repeat text-[#2d2414] ${textSize} uppercase tracking-wide hover:scale-105 transition-transform drop-shadow-2xl flex items-center justify-center pt-1 ${padding} whitespace-nowrap ${className}`;
    const style = { fontFamily: 'var(--font-techno)', textShadow: '0px 1px 1px rgba(255,255,255,0.6)' };

    if (href) {
        return (
            <Link href={href} className={baseClasses} style={style}>
                {children}
            </Link>
        );
    }

    return (
        <button onClick={onClick} className={baseClasses} style={style}>
            {children}
        </button>
    );
}
