/**
 * A short name for a version of the engine data (version.json's pinned commits): the folder the
 * data is kept under in storage, for a browser to fetch the same scripts the server plays. On its
 * own (no engine) so the upload script can share it: web/scripts/engine/upload-engine.mjs.
 */
export function engineDataId(version: string): string {
    const v = JSON.parse(version) as { format?: number; scripts?: string; cards?: string; strings?: string };
    return [v.format ?? 1, v.scripts, v.cards, v.strings].map((p) => String(p ?? '').slice(0, 10)).join('-');
}
