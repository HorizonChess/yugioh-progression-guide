"use client";

import { useState } from "react";
import { useProgression } from "@/context/ProgressionContext";
import { keysOn, setKeysOn, setSoundOn, soundOn } from "@/components/packs/stage/fx";

/** One switch: a label and note on the left, a gold-rimmed toggle on the right. */
function Toggle({ label, note, on, disabled, onChange }: { label: string; note: string; on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
    return (
        <label className={`menu-option ${disabled ? "menu-option--disabled" : ""}`}>
            <span>
                <b>{label}</b>
                <small>{note}</small>
            </span>
            <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
            <i aria-hidden="true" />
        </label>
    );
}

/** The menu's Options: sound and the guide, remembered on this device. */
export default function MenuOptions() {
    const { isGuideVisible, setGuideVisible } = useProgression();
    // Only shown after a tap in the menu, never in the static render, so storage can be read straight away.
    const [sound, setSound] = useState(soundOn);
    const [keys, setKeys] = useState(keysOn);

    return (
        <div className="menu-options">
            <h2>Options</h2>
            <Toggle label="Sound" note="Pack opening and every other sound" on={sound} onChange={(on) => { setSoundOn(on); setSound(on); }} />
            <Toggle label="Yugi's typewriter" note="Keys clacking as his words type out" on={sound && keys} disabled={!sound} onChange={(on) => { setKeysOn(on); setKeys(on); }} />
            <Toggle label="Yugi, the guide" note="Tips on sets and cards, and words on your pulls and duels" on={isGuideVisible} onChange={setGuideVisible} />
        </div>
    );
}
