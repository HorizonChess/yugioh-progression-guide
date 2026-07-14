"use client";

/**
 * Wins/losses scoreboard. Uses the painted PNG at its true 952:792 aspect
 * (never stretched); the numbers are pinned as % over the panel's green/red
 * gems. Size/position "knobs" the user tunes live here:
 *   panel size  → the h-[clamp(...)] below
 *   text pos    → the .stats-gem left-[30%|70%] / top-[46%]
 *   text size   → the .stats-gem__label / __value clamps in globals.css
 */
export default function StatsPanel({ wins, losses }: { wins: number; losses: number }) {
    return (
        <div className="relative h-[clamp(6.5rem,16vh,12rem)] aspect-[952/792] bg-[url('/ui/stats_panel_cropped.png')] bg-contain bg-center bg-no-repeat animate-in slide-in-from-bottom-10 duration-700 lg:mx-auto">
            {/* Green gem ~ 30% x, ~46% y */}
            <div className="stats-gem top-[46%] left-[30%]">
                <span className="stats-gem__label text-win">Wins</span>
                <span className="stats-gem__value">{wins}</span>
            </div>
            {/* Red gem ~ 70% x, ~46% y */}
            <div className="stats-gem top-[46%] left-[70%]">
                <span className="stats-gem__label text-loss">Losses</span>
                <span className="stats-gem__value">{losses}</span>
            </div>
        </div>
    );
}
