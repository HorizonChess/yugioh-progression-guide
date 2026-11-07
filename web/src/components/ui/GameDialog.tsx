"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./game-dialog.css";

/*
 * The game's own alert and confirm: a lacquer tablet with a gold edge over a
 * dimmed screen, in place of the browser's grey boxes. Call gameAlert /
 * gameConfirm / gameAsk from anywhere (a handler, a context, a plain function);
 * <GameDialogHost /> in the root layout shows them one at a time, in order.
 */

export type DialogTone = "gold" | "danger";

export interface DialogButton<T> {
    label: string;
    value: T;
    /** "primary" is the lit tablet; "quiet" the dim one (Cancel, Not now). */
    kind?: "primary" | "quiet";
}

export interface DialogRequest<T> {
    title?: string;
    message: ReactNode;
    buttons: DialogButton<T>[];
    /** What Escape (or a tap outside) answers. */
    dismissValue: T;
    /** Red edge, for losing cards or a save. */
    tone?: DialogTone;
    /** The button focused on open (by index); Enter presses it. */
    focus?: number;
}

interface Pending {
    id: number;
    request: DialogRequest<unknown>;
    resolve: (value: unknown) => void;
}

let queue: Pending[] = [];
let nextId = 0;
let hosts = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Shows a dialog and resolves with the value of the button pressed. */
export function gameAsk<T>(request: DialogRequest<T>): Promise<T> {
    return new Promise<T>((resolve) => {
        queue = [...queue, { id: nextId++, request: request as DialogRequest<unknown>, resolve: resolve as (v: unknown) => void }];
        emit();
    });
}

/** An announcement with one button. */
export function gameAlert(message: ReactNode, { title, tone, okLabel = "OK" }: { title?: string; tone?: DialogTone; okLabel?: string } = {}): Promise<void> {
    if (!hosts && typeof window !== "undefined") {
        // No host mounted (a test, a page outside the layout): fall back to the browser's.
        window.alert(typeof message === "string" ? message : title ?? "");
        return Promise.resolve();
    }
    return gameAsk<void>({ title, message, tone, buttons: [{ label: okLabel, value: undefined }], dismissValue: undefined });
}

/** A yes-or-no question. `danger` reddens it and puts the focus on Cancel. */
export function gameConfirm(
    message: ReactNode,
    { title, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false }: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
    if (!hosts && typeof window !== "undefined") return Promise.resolve(window.confirm(typeof message === "string" ? message : title ?? ""));
    return gameAsk<boolean>({
        title,
        message,
        tone: danger ? "danger" : "gold",
        buttons: [
            { label: cancelLabel, value: false, kind: "quiet" },
            { label: confirmLabel, value: true },
        ],
        dismissValue: false,
        focus: danger ? 0 : 1,
    });
}

/** Mount once, in the root layout. */
export function GameDialogHost() {
    const [current, setCurrent] = useState<Pending | null>(queue[0] ?? null);
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);

    useEffect(() => {
        hosts++;
        const sync = () => setCurrent(queue[0] ?? null);
        listeners.add(sync);
        sync();
        return () => {
            hosts--;
            listeners.delete(sync);
        };
    }, []);

    const answer = (value: unknown) => {
        if (!current) return;
        queue = queue.filter((p) => p.id !== current.id);
        current.resolve(value);
        emit();
    };

    useEffect(() => {
        if (!current) return;
        const { request } = current;
        const opener = document.activeElement as HTMLElement | null;
        buttons.current[request.focus ?? request.buttons.length - 1]?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                // Ours alone: a close-up or chamber underneath must not close too.
                e.stopImmediatePropagation();
                e.preventDefault();
                answer(request.dismissValue);
            } else if (e.key === "Tab") {
                // Keep the focus on the tablet's buttons.
                const list = buttons.current.filter((b): b is HTMLButtonElement => !!b);
                const at = list.indexOf(document.activeElement as HTMLButtonElement);
                e.preventDefault();
                list[(at + (e.shiftKey ? -1 : 1) + list.length) % list.length]?.focus();
            }
        };
        // Capture, so it runs before the listeners of whatever is underneath.
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per dialog shown
    }, [current?.id]);

    if (!current || typeof document === "undefined") return null;
    const { request } = current;
    const titleId = `gd-title-${current.id}`;
    const messageId = `gd-msg-${current.id}`;
    return createPortal(
        <div className="gd" onPointerDown={(e) => e.target === e.currentTarget && answer(request.dismissValue)}>
            <div
                key={current.id}
                className={`gd__tablet ${request.tone === "danger" ? "gd__tablet--danger" : ""}`}
                role={request.buttons.length > 1 ? "alertdialog" : "dialog"}
                aria-modal="true"
                aria-labelledby={request.title ? titleId : undefined}
                aria-describedby={messageId}
            >
                <span className="gd__eye" aria-hidden="true" />
                {request.title && <h2 id={titleId} className="gd__title">{request.title}</h2>}
                <div id={messageId} className="gd__message">{request.message}</div>
                <div className="gd__buttons">
                    {request.buttons.map((b, i) => (
                        <button
                            key={b.label}
                            ref={(el) => { buttons.current[i] = el; }}
                            type="button"
                            className={`gd__btn ${b.kind === "quiet" ? "gd__btn--quiet" : ""}`}
                            onClick={() => answer(b.value)}
                        >
                            <span className="gd__btn-words">{b.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>,
        document.body,
    );
}
