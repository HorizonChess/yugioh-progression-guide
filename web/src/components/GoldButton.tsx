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
    textSize = "text-xl"
}: GoldButtonProps) {
    const containerClasses = `${width} ${height} relative block bg-[url('/ui/button_gold.png')] bg-[length:100%_100%] bg-center bg-no-repeat hover:scale-105 transition-transform drop-shadow-2xl ${className}`;
    const textClasses = `absolute inset-x-[22%] top-1/2 -translate-y-1/2 text-center text-[#2d2414] ${textSize} uppercase tracking-wide whitespace-nowrap flex items-center justify-center pt-1 font-black`;
    const textStyle = { fontFamily: 'var(--font-techno)', textShadow: '0px 1px 1px rgba(255,255,255,0.6)' };

    if (href) {
        return (
            <Link href={href} className={containerClasses}>
                <span className={textClasses} style={textStyle}>
                    {children}
                </span>
            </Link>
        );
    }

    return (
        <button onClick={onClick} className={containerClasses}>
            <span className={textClasses} style={textStyle}>
                {children}
            </span>
        </button>
    );
}
