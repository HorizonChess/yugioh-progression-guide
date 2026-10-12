/**
 * Parses a YDK file content and returns an array of card IDs.
 * YDK files typically have sections like #main, #extra, #side.
 * We want to extract all card IDs from these sections.
 */
export function parseYDK(content: string): number[] {
    const lines = content.split(/\r?\n/);
    const ids: number[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments (lines starting with # or !) and empty lines
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
            continue;
        }

        // Try to parse as number
        const id = parseInt(trimmed, 10);
        if (!isNaN(id)) {
            ids.push(id);
        }
    }

    return ids;
}

/**
 * Parses a YDK file content and returns card IDs organized by section.
 * Used by deck builder which needs separate main/extra/side decks.
 */
export function parseYDKWithSections(content: string): { main: number[], extra: number[], side: number[] } {
    const lines = content.split(/\r?\n/);
    const result = { main: [] as number[], extra: [] as number[], side: [] as number[] };
    let currentSection: 'main' | 'extra' | 'side' = 'main';

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '#main') { currentSection = 'main'; continue; }
        if (trimmed === '#extra') { currentSection = 'extra'; continue; }
        if (trimmed === '!side') { currentSection = 'side'; continue; }
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;

        const id = parseInt(trimmed, 10);
        if (!isNaN(id)) result[currentSection].push(id);
    }
    return result;
}

/**
 * Generates YDK file content from deck sections.
 */
export function generateYDK(deck: { main: number[], extra: number[], side: number[] }): string {
    const lines = ['#created by Progression Series Guide', '#main'];
    deck.main.forEach(id => lines.push(id.toString()));
    lines.push('#extra');
    deck.extra.forEach(id => lines.push(id.toString()));
    lines.push('!side');
    deck.side.forEach(id => lines.push(id.toString()));
    return lines.join('\n');
}

/**
 * Generates YDK file content from a flat collection (main deck only format).
 */
export function generateYDKFromCollection(collection: Record<string, number>): string {
    const lines = ['#created by Progression Series Guide', '#main'];

    Object.entries(collection).forEach(([idStr, count]) => {
        const id = parseInt(idStr);
        for (let i = 0; i < count; i++) {
            lines.push(id.toString());
        }
    });

    lines.push('#extra', '!side');
    return lines.join('\n');
}

/**
 * Downloads a YDK file. Uses File System Access API when available,
 * falls back to blob URL download.
 */
export async function downloadYDK(filename: string, content: string): Promise<void> {
    // Add BOM for Windows compatibility
    const contentWithBOM = '\uFEFF' + content;
    const blob = new Blob([contentWithBOM], { type: 'text/plain;charset=utf-8' });

    // Strategy 1: File System Access API (Force "Save As")
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: 'YDK File',
                    accept: { 'text/plain': ['.ydk'] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (err) {
            // Ignore AbortError (user cancelled)
            if (err instanceof DOMException && err.name === 'AbortError') return;
            console.error('SaveFilePicker failed:', err);
        }
    }

    // Strategy 2: Standard Blob URL Download (Fallback)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 1000);
}
