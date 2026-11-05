"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cinzel, Felipa, IM_Fell_English } from "next/font/google";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useAuth } from "@/context/AuthContext";
import { verifyEmail } from "@/lib/auth-client";
import Desk from "./Desk";
import Envelope from "./Envelope";
import Letter from "./Letter";
import LetterForms, { type Landing, type LetterView } from "./LetterForms";
import { LEATHER, LINER, PAPER_GRAIN, PAPER_MOTTLE } from "./textures";
import "./onboarding.css";

gsap.registerPlugin(useGSAP);

const script = Felipa({ weight: "400", subsets: ["latin"], variable: "--font-script" });
const fell = IM_Fell_English({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-fell" });
const cinzel = Cinzel({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-cinzel" });

type LetterState = { view: LetterView; from: DOMRect | "below"; landing?: Landing };
/** What's on the desk. The envelope stays (off screen) while its letter is out, so its shards and exit can finish. */
type Scene = { title: boolean; envelope: boolean; letter: LetterState | null };

const textures = {
    "--tex-grain": PAPER_GRAIN,
    "--tex-mottle": PAPER_MOTTLE,
    "--tex-leather": LEATHER,
    "--tex-liner": LINER,
} as React.CSSProperties;

/**
 * The title screen and onboarding (route: /). A candlelit desk: press start, and a sealed
 * invitation lands on it; breaking the seal unfolds the letter the account forms are written on.
 * BACK TO TITLE comes back here; email links and the Google redirect land here too.
 */
export default function OnboardingScene() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const root = useRef<HTMLDivElement>(null);
    const [reduce, setReduce] = useState(false);
    const [scene, setScene] = useState<Scene | null>(null);
    const [banner, setBanner] = useState<string | null>(null);

    // Email links and the Google redirect arrive with ?verify=, ?reset= or ?google=.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const verify = params.get("verify");
        const reset = params.get("reset") ?? undefined;
        const google = params.get("google") ?? undefined;
        if (params.size) router.replace("/");
        if (verify) void verifyEmail(verify).then((r) => setBanner(r.ok ? "Email confirmed. Thank you!" : r.message));
        const letter = (view: LetterView, landing: Landing): Scene => ({ title: false, envelope: false, letter: { view, from: "below", landing } });
        let next: Scene = { title: !params.has("invite"), envelope: params.has("invite"), letter: null };
        if (reset) next = letter("reset", { reset });
        else if (google === "claim") next = letter("claim", { google });
        else if (google && google !== "ok") next = letter("signin", { google });
        void Promise.resolve().then(() => {
            setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
            if (google === "ok") setBanner("Signed in with Google.");
            setScene(next);
        });
    }, [router]);

    const { context } = useGSAP(
        () => {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
            gsap.to(".ob-desk__warmth", { opacity: () => gsap.utils.random(0.82, 1), scale: () => gsap.utils.random(0.985, 1.02), duration: () => gsap.utils.random(0.08, 0.35), repeat: -1, repeatRefresh: true, ease: "sine.inOut" });
            gsap.to(".ob-logo__shine", { backgroundPosition: "-60% 0", duration: 2.4, repeat: -1, repeatDelay: 2.5, ease: "power2.inOut" });
            gsap.to(".ob-press", { autoAlpha: 0.25, duration: 0.9, repeat: -1, yoyo: true, ease: "sine.inOut" });
        },
        { scope: root },
    );

    // Handlers add their animations to the hook's context, so they're scoped to the scene and reverted with it.
    useEffect(() => {
        if (scene) context.add(() => gsap.to(root.current, { "--lamp": scene.title ? 0.45 : 1, duration: reduce ? 0 : 1.4, ease: "power2.inOut" }));
    }, [scene, context, reduce]);

    const exit = () =>
        context.add(() => {
            gsap.to(".ob-stage", { autoAlpha: 0, y: -16, duration: reduce ? 0 : 0.5, ease: "power2.in" });
            gsap.to(root.current, { "--lamp": 0, duration: reduce ? 0 : 0.9, ease: "power2.inOut", onComplete: () => router.push("/menu/") });
        });

    const start = () => {
        if (!scene?.title || loading) return;
        if (user) {
            exit();
            return;
        }
        context.add(() => gsap.to(".ob-title", { autoAlpha: 0, scale: 1.06, duration: reduce ? 0 : 0.6, ease: "power2.in", onComplete: () => setScene({ title: false, envelope: true, letter: null }) }));
    };

    return (
        <div ref={root} className={`ob-scene ${script.variable} ${fell.variable} ${cinzel.variable}`} style={textures}>
            <Desk />
            {scene?.title && (
                <div className="ob-stage ob-title" onClick={start}>
                    <h1 className="ob-logo">
                        <span className="ob-logo__main">YU-GI-OH!</span>
                        <span className="ob-logo__shine" aria-hidden>YU-GI-OH!</span>
                    </h1>
                    <p className="ob-logo-sub">Progression Series</p>
                    {banner && <p role="status" className="ob-banner">{banner}</p>}
                    {user && <p className="ob-welcome">Welcome back, {user.duelistName}</p>}
                    {/* Focused, so Enter or Space starts; its click bubbles to the title's. */}
                    <button type="button" className="ob-press" autoFocus>
                        Press Start
                    </button>
                </div>
            )}
            {scene?.envelope && (
                <div className={`ob-stage ${scene.letter ? "ob-stage--behind" : ""}`}>
                    <Envelope
                        reduce={reduce}
                        onLetterOut={(from) => setScene({ title: false, envelope: true, letter: { view: "invite", from } })}
                        onSignIn={() => setScene({ title: false, envelope: false, letter: { view: "signin", from: "below" } })}
                        onGuest={exit}
                    />
                </div>
            )}
            {scene?.letter && (
                <div className="ob-stage">
                    <Letter from={scene.letter.from} reduce={reduce}>
                        <LetterForms start={scene.letter.view} landing={scene.letter.landing} reduce={reduce} onEnter={exit} onGuest={exit} />
                    </Letter>
                </div>
            )}
        </div>
    );
}
