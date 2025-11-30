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
