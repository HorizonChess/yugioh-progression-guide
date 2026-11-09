import Link from "next/link";
import "./privacy.css";

export const metadata = { title: "Privacy · Yu-Gi-Oh! Progression Guide" };

/**
 * The privacy policy (route: /privacy). Google's sign-in setup asks for one; it's linked
 * quietly from the menu's footer, beside the version.
 */
export default function PrivacyPage() {
    return (
        <div className="privacy">
            <article className="privacy__sheet">
                <h1>Privacy</h1>
                <p className="privacy__lede">A fan-made game for playing through Yu-Gi-Oh! history with friends. It keeps only what it needs to run.</p>

                <h2>What&apos;s kept</h2>
                <ul>
                    <li><b>Your account:</b> your email address, your duelist name, and your password (stored only as a one-way hash), or your Google account&apos;s id if you sign in with Google.</li>
                    <li><b>Your game:</b> your series, collection, decks, matches, duels and rewards.</li>
                    <li><b>A sign-in cookie</b>, so you stay signed in. There are no ads, trackers or analytics.</li>
                    <li>Playing as a <b>guest</b>, your saves stay in your own browser and never reach the server.</li>
                </ul>

                <h2>Email</h2>
                <p>Your email is used only to confirm your address and to reset your password. It&apos;s never shared or sold, and you won&apos;t get newsletters.</p>

                <h2>Who sees it</h2>
                <p>Players in a series with you see your duelist name, and what the game shows them of your play. Nothing else is shared. The data is stored with MongoDB Atlas and the app runs on Render; card images and data come from YGOPRODeck.</p>

                <h2>Deleting it</h2>
                <p>To have your account and everything in it deleted, write to <a href="mailto:xeleton@gmail.com">xeleton@gmail.com</a> from the address you signed up with.</p>

                <Link href="/menu" className="privacy__back">Back to the menu</Link>
            </article>
        </div>
    );
}
