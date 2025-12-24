import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLayoutDesignerContext } from '@/context/LayoutDesignerContext';

// =============================================================================
// TYPES
// =============================================================================

type LayoutMode = 'fixed' | 'grid';

interface DesignerBox {
    id: string;
    label: string;
    originalRect: DOMRect;
    // Fixed mode (percentages):
    fixed: { top: number; left: number; width: number; height: number };
    // Grid mode:
    grid: { row: number; column: number; rowSpan: number; colSpan: number };
}

interface GridConfig {
    rows: number;
    columns: number;
    gap: number;
}

// =============================================================================
// UTILITIES
// =============================================================================

function generateElementId(element: HTMLElement, container: HTMLElement): string {
    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== container) {
        const parent: HTMLElement | null = current.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(current);
            const tag = current.tagName.toLowerCase();
            path.unshift(`${tag}${index}`);
        }
        current = parent;
    }

    return element.id || `el_${path.join('_')}`;
}

function getElementLabel(element: HTMLElement): string {
    if (element.id) return `#${element.id}`;
    const classes = element.className?.split?.(' ')?.[0];
    if (classes) return `.${classes}`;
    return element.tagName.toLowerCase();
}

// Convert fixed percentages to grid position
function fixedToGrid(fixed: DesignerBox['fixed'], gridConfig: GridConfig): DesignerBox['grid'] {
    const cellWidth = 100 / gridConfig.columns;
    const cellHeight = 100 / gridConfig.rows;

    const col = Math.round(fixed.left / cellWidth) + 1;
    const row = Math.round(fixed.top / cellHeight) + 1;
    const colSpan = Math.max(1, Math.round(fixed.width / cellWidth));
    const rowSpan = Math.max(1, Math.round(fixed.height / cellHeight));

    return {
        row: Math.max(1, Math.min(row, gridConfig.rows)),
        column: Math.max(1, Math.min(col, gridConfig.columns)),
        rowSpan: Math.min(rowSpan, gridConfig.rows - row + 1),
        colSpan: Math.min(colSpan, gridConfig.columns - col + 1),
    };
}

// Convert grid position to fixed percentages
function gridToFixed(grid: DesignerBox['grid'], gridConfig: GridConfig): DesignerBox['fixed'] {
    const cellWidth = 100 / gridConfig.columns;
    const cellHeight = 100 / gridConfig.rows;

    return {
        left: (grid.column - 1) * cellWidth,
        top: (grid.row - 1) * cellHeight,
        width: grid.colSpan * cellWidth,
        height: grid.rowSpan * cellHeight,
    };
}

// =============================================================================
// MAIN HOOK
// =============================================================================

export function useLayoutDesigner() {
    const { isDesignerMode, scaleFactor, toggleDesignerMode } = useLayoutDesignerContext();

    // State
    const [mode, setMode] = useState<LayoutMode>('grid');
    const [boxes, setBoxes] = useState<DesignerBox[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [gridConfig, setGridConfig] = useState<GridConfig>({ rows: 12, columns: 12, gap: 8 });
    const [containerBounds, setContainerBounds] = useState<DOMRect | null>(null);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const boxesRef = useRef<DesignerBox[]>([]); // Keep current boxes in ref to avoid stale closures
    const dragStateRef = useRef<{
        type: 'drag' | 'resize';
        corner?: 'nw' | 'ne' | 'sw' | 'se';
        startX: number;
        startY: number;
        startBox: DesignerBox;
    } | null>(null);

    // Keep boxesRef in sync
    useEffect(() => {
        boxesRef.current = boxes;
    }, [boxes]);

    // Scan elements when designer mode is activated
    useEffect(() => {
        if (!isDesignerMode || !containerRef.current) {
            setBoxes([]);
            setSelectedId(null);
            return;
        }

        const container = containerRef.current;
        const containerRect = container.getBoundingClientRect();
        setContainerBounds(containerRect);

        const scannedBoxes: DesignerBox[] = [];
        const seen = new Set<HTMLElement>();

        const scanNode = (node: HTMLElement, depth: number) => {
            if (node.classList.contains('designer-ui')) return;
            if (node.closest('.designer-ui')) return;
            if (seen.has(node)) return;
            seen.add(node);

            if (node === container) {
                Array.from(node.children).forEach(child => {
                    if (child instanceof HTMLElement) scanNode(child, depth);
                });
                return;
            }

            const rect = node.getBoundingClientRect();
            if (rect.width < 5 || rect.height < 5) return;

            const id = generateElementId(node, container);
            const label = getElementLabel(node);

            // Calculate position as percentage of container
            const containerW = containerRect.width / scaleFactor;
            const containerH = containerRect.height / scaleFactor;
            const relTop = ((rect.top - containerRect.top) / scaleFactor) / containerH * 100;
            const relLeft = ((rect.left - containerRect.left) / scaleFactor) / containerW * 100;
            const relWidth = (rect.width / scaleFactor) / containerW * 100;
            const relHeight = (rect.height / scaleFactor) / containerH * 100;

            const fixed = {
                top: Number(relTop.toFixed(2)),
                left: Number(relLeft.toFixed(2)),
                width: Number(relWidth.toFixed(2)),
                height: Number(relHeight.toFixed(2)),
            };

            scannedBoxes.push({
                id,
                label,
                originalRect: rect,
                fixed,
                grid: fixedToGrid(fixed, gridConfig),
            });

            // Scan children (limit depth)
            if (depth < 8) {
                Array.from(node.children).forEach(child => {
                    if (child instanceof HTMLElement) scanNode(child, depth + 1);
                });
            }
        };

        Array.from(container.children).forEach(child => {
            if (child instanceof HTMLElement) scanNode(child, 0);
        });

        setBoxes(scannedBoxes);
    }, [isDesignerMode, scaleFactor, gridConfig]);

    // Update container bounds on resize
    useEffect(() => {
        if (!isDesignerMode || !containerRef.current) return;

        const updateBounds = () => {
            if (containerRef.current) {
                setContainerBounds(containerRef.current.getBoundingClientRect());
            }
        };

        window.addEventListener('resize', updateBounds);
        return () => window.removeEventListener('resize', updateBounds);
    }, [isDesignerMode]);

    // Get the virtual position for a box based on current mode
    const getBoxPosition = useCallback((box: DesignerBox) => {
        if (mode === 'grid') {
            return gridToFixed(box.grid, gridConfig);
        }
        return box.fixed;
    }, [mode, gridConfig]);

    // Update a box's position
    const updateBox = useCallback((id: string, updates: Partial<{ fixed: DesignerBox['fixed']; grid: DesignerBox['grid'] }>) => {
        setBoxes(prev => prev.map(box => {
            if (box.id !== id) return box;
            return { ...box, ...updates };
        }));
    }, []);

    // Handle drag/resize - use ref to get current boxes to avoid stale closure
    const handleMouseDown = useCallback((e: React.MouseEvent, boxId: string, type: 'drag' | 'resize', corner?: 'nw' | 'ne' | 'sw' | 'se') => {
        e.preventDefault();
        e.stopPropagation();

        // Use ref to get current boxes (avoids stale closure)
        const currentBoxes = boxesRef.current;
        const box = currentBoxes.find(b => b.id === boxId);
        if (!box) return;

        setSelectedId(boxId);
        dragStateRef.current = {
            type,
            corner,
            startX: e.clientX,
            startY: e.clientY,
            startBox: { ...box },
        };

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!dragStateRef.current || !containerBounds) return;

            const { type, corner, startX, startY, startBox } = dragStateRef.current;

            // Calculate delta in percentage
            const containerW = containerBounds.width / scaleFactor;
            const containerH = containerBounds.height / scaleFactor;
            const deltaX = ((moveEvent.clientX - startX) / scaleFactor) / containerW * 100;
            const deltaY = ((moveEvent.clientY - startY) / scaleFactor) / containerH * 100;

            if (mode === 'fixed') {
                let newFixed = { ...startBox.fixed };

                if (type === 'drag') {
                    newFixed.left = Number((startBox.fixed.left + deltaX).toFixed(2));
                    newFixed.top = Number((startBox.fixed.top + deltaY).toFixed(2));
                } else if (type === 'resize' && corner) {
                    if (corner.includes('w')) {
                        newFixed.width = Math.max(2, startBox.fixed.width - deltaX);
                        newFixed.left = startBox.fixed.left + deltaX;
                    }
                    if (corner.includes('e')) {
                        newFixed.width = Math.max(2, startBox.fixed.width + deltaX);
                    }
                    if (corner.includes('n')) {
                        newFixed.height = Math.max(2, startBox.fixed.height - deltaY);
                        newFixed.top = startBox.fixed.top + deltaY;
                    }
                    if (corner.includes('s')) {
                        newFixed.height = Math.max(2, startBox.fixed.height + deltaY);
                    }
                    newFixed = {
                        left: Number(newFixed.left.toFixed(2)),
                        top: Number(newFixed.top.toFixed(2)),
                        width: Number(newFixed.width.toFixed(2)),
                        height: Number(newFixed.height.toFixed(2)),
                    };
                }

                updateBox(startBox.id, { fixed: newFixed, grid: fixedToGrid(newFixed, gridConfig) });
            } else {
                // Grid mode - snap to cells
                const cellWidth = 100 / gridConfig.columns;
                const cellHeight = 100 / gridConfig.rows;

                let newGrid = { ...startBox.grid };

                if (type === 'drag') {
                    const newLeft = startBox.fixed.left + deltaX;
                    const newTop = startBox.fixed.top + deltaY;
                    newGrid.column = Math.max(1, Math.min(Math.round(newLeft / cellWidth) + 1, gridConfig.columns - newGrid.colSpan + 1));
                    newGrid.row = Math.max(1, Math.min(Math.round(newTop / cellHeight) + 1, gridConfig.rows - newGrid.rowSpan + 1));
                } else if (type === 'resize' && corner) {
                    const startFixed = gridToFixed(startBox.grid, gridConfig);

                    if (corner.includes('e')) {
                        const newRight = startFixed.left + startFixed.width + deltaX;
                        const endCol = Math.max(newGrid.column, Math.min(Math.round(newRight / cellWidth), gridConfig.columns));
                        newGrid.colSpan = endCol - newGrid.column + 1;
                    }
                    if (corner.includes('w')) {
                        const newLeft = startFixed.left + deltaX;
                        const startCol = Math.max(1, Math.min(Math.round(newLeft / cellWidth) + 1, startBox.grid.column + startBox.grid.colSpan - 1));
                        newGrid.colSpan = startBox.grid.column + startBox.grid.colSpan - startCol;
                        newGrid.column = startCol;
                    }
                    if (corner.includes('s')) {
                        const newBottom = startFixed.top + startFixed.height + deltaY;
                        const endRow = Math.max(newGrid.row, Math.min(Math.round(newBottom / cellHeight), gridConfig.rows));
                        newGrid.rowSpan = endRow - newGrid.row + 1;
                    }
                    if (corner.includes('n')) {
                        const newTop = startFixed.top + deltaY;
                        const startRow = Math.max(1, Math.min(Math.round(newTop / cellHeight) + 1, startBox.grid.row + startBox.grid.rowSpan - 1));
                        newGrid.rowSpan = startBox.grid.row + startBox.grid.rowSpan - startRow;
                        newGrid.row = startRow;
                    }
                }

                const newFixed = gridToFixed(newGrid, gridConfig);
                updateBox(startBox.id, { grid: newGrid, fixed: newFixed });
            }
        };

        const onMouseUp = () => {
            dragStateRef.current = null;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [containerBounds, scaleFactor, mode, gridConfig, updateBox]);

    // Generate export JSON
    const exportJson = useMemo(() => {
        if (mode === 'fixed') {
            const result: Record<string, { top: number; left: number; width: number; height: number }> = {};
            boxes.forEach(box => {
                result[box.id] = box.fixed;
            });
            return result;
        } else {
            return {
                gridConfig: { rows: gridConfig.rows, columns: gridConfig.columns, gap: gridConfig.gap },
                elements: boxes.reduce((acc, box) => {
                    acc[box.id] = {
                        gridRow: `${box.grid.row} / span ${box.grid.rowSpan}`,
                        gridColumn: `${box.grid.column} / span ${box.grid.colSpan}`,
                    };
                    return acc;
                }, {} as Record<string, { gridRow: string; gridColumn: string }>),
            };
        }
    }, [mode, boxes, gridConfig]);

    // Reset all virtual positions to original
    const resetAll = useCallback(() => {
        if (!containerRef.current || !containerBounds) return;

        setBoxes(prev => prev.map(box => {
            const containerW = containerBounds.width / scaleFactor;
            const containerH = containerBounds.height / scaleFactor;
            const relTop = ((box.originalRect.top - containerBounds.top) / scaleFactor) / containerH * 100;
            const relLeft = ((box.originalRect.left - containerBounds.left) / scaleFactor) / containerW * 100;
            const relWidth = (box.originalRect.width / scaleFactor) / containerW * 100;
            const relHeight = (box.originalRect.height / scaleFactor) / containerH * 100;

            const fixed = {
                top: Number(relTop.toFixed(2)),
                left: Number(relLeft.toFixed(2)),
                width: Number(relWidth.toFixed(2)),
                height: Number(relHeight.toFixed(2)),
            };

            return {
                ...box,
                fixed,
                grid: fixedToGrid(fixed, gridConfig),
            };
        }));
        setSelectedId(null);
    }, [containerBounds, scaleFactor, gridConfig]);

    // ===========================================================================
    // DESIGNER OVERLAY COMPONENT
    // ===========================================================================
    const DesignerOverlay = useCallback(() => {
        if (!isDesignerMode || !containerBounds) return null;

        const selectedBox = boxes.find(b => b.id === selectedId);

        const overlayContent = (
            <>
                {/* Full-screen blocker - but leave a gap at top for TopBar (z-100) */}
                <div
                    className="designer-ui"
                    style={{
                        position: 'fixed',
                        top: 60, // Leave space for TopBar
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 9990,
                        pointerEvents: 'auto',
                        background: 'transparent',
                    }}
                    onClick={() => setSelectedId(null)}
                />

                {/* Grid overlay (only in grid mode) */}
                {mode === 'grid' && (
                    <div
                        className="designer-ui"
                        style={{
                            position: 'fixed',
                            top: containerBounds.top,
                            left: containerBounds.left,
                            width: containerBounds.width,
                            height: containerBounds.height,
                            zIndex: 9991,
                            pointerEvents: 'none',
                            display: 'grid',
                            gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
                            gridTemplateColumns: `repeat(${gridConfig.columns}, 1fr)`,
                            gap: `${gridConfig.gap * scaleFactor}px`,
                        }}
                    >
                        {Array.from({ length: gridConfig.rows * gridConfig.columns }).map((_, i) => (
                            <div
                                key={i}
                                style={{
                                    border: '1px dashed rgba(59, 130, 246, 0.2)',
                                    background: 'transparent',
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* Virtual box overlays */}
                {boxes.map(box => {
                    const pos = getBoxPosition(box);
                    const isSelected = box.id === selectedId;

                    // Convert percentage to pixels based on container
                    const pxTop = containerBounds.top + (pos.top / 100) * containerBounds.height;
                    const pxLeft = containerBounds.left + (pos.left / 100) * containerBounds.width;
                    const pxWidth = (pos.width / 100) * containerBounds.width;
                    const pxHeight = (pos.height / 100) * containerBounds.height;

                    return (
                        <div
                            key={box.id}
                            className="designer-ui"
                            style={{
                                position: 'fixed',
                                top: pxTop,
                                left: pxLeft,
                                width: pxWidth,
                                height: pxHeight,
                                zIndex: isSelected ? 9999 : 9992,
                                border: isSelected ? '2px solid #f59e0b' : '1px solid rgba(59, 130, 246, 0.5)',
                                background: isSelected ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                                pointerEvents: 'auto',
                                cursor: 'move',
                                boxSizing: 'border-box',
                            }}
                            onClick={(e) => { e.stopPropagation(); setSelectedId(box.id); }}
                            onMouseDown={(e) => handleMouseDown(e, box.id, 'drag')}
                        >
                            {/* Label */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: -18,
                                    left: 0,
                                    background: isSelected ? '#f59e0b' : '#3b82f6',
                                    color: 'white',
                                    fontSize: '9px',
                                    padding: '1px 4px',
                                    borderRadius: '2px',
                                    fontFamily: 'monospace',
                                    whiteSpace: 'nowrap',
                                    maxWidth: '150px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {box.label}
                            </div>

                            {/* Resize handles (only for selected) */}
                            {isSelected && ['nw', 'ne', 'sw', 'se'].map(corner => (
                                <div
                                    key={corner}
                                    style={{
                                        position: 'absolute',
                                        width: 10,
                                        height: 10,
                                        background: 'white',
                                        border: '2px solid #f59e0b',
                                        borderRadius: '50%',
                                        top: corner.includes('n') ? -5 : 'auto',
                                        bottom: corner.includes('s') ? -5 : 'auto',
                                        left: corner.includes('w') ? -5 : 'auto',
                                        right: corner.includes('e') ? -5 : 'auto',
                                        cursor: `${corner}-resize`,
                                        zIndex: 10000,
                                    }}
                                    onMouseDown={(e) => handleMouseDown(e, box.id, 'resize', corner as 'nw' | 'ne' | 'sw' | 'se')}
                                />
                            ))}
                        </div>
                    );
                })}

                {/* Exit Designer Button - Top right, above everything */}
                <button
                    className="designer-ui"
                    onClick={(e) => { e.stopPropagation(); toggleDesignerMode(); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                        position: 'fixed',
                        top: 16,
                        right: 16,
                        zIndex: 10002,
                        background: '#dc2626',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 16px',
                        color: 'white',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    <span style={{ fontSize: 14 }}>✕</span> EXIT DESIGNER
                </button>

                {/* Designer Panel */}
                <div
                    className="designer-ui"
                    style={{
                        position: 'fixed',
                        bottom: 16,
                        left: 16,
                        zIndex: 10001,
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        width: 320,
                        maxHeight: '50vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                        fontFamily: 'system-ui, sans-serif',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {/* Mode Tabs */}
                    <div style={{ display: 'flex', borderBottom: '1px solid #334155' }}>
                        {(['fixed', 'grid'] as LayoutMode[]).map(m => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    background: mode === m ? '#1e3a5f' : 'transparent',
                                    border: 'none',
                                    color: mode === m ? '#60a5fa' : '#64748b',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {m}
                            </button>
                        ))}
                    </div>

                    {/* Grid Config (only in grid mode) */}
                    {mode === 'grid' && (
                        <div style={{ padding: '8px 12px', borderBottom: '1px solid #334155', background: '#1e293b' }}>
                            <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Grid Config</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#94a3b8' }}>
                                    Rows:
                                    <input
                                        type="number"
                                        value={gridConfig.rows}
                                        onChange={(e) => setGridConfig(prev => ({ ...prev, rows: Math.max(1, parseInt(e.target.value) || 12) }))}
                                        style={{ width: 40, padding: '2px 4px', background: '#0f172a', border: '1px solid #334155', borderRadius: 3, color: '#e2e8f0', fontSize: 10 }}
                                    />
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#94a3b8' }}>
                                    Cols:
                                    <input
                                        type="number"
                                        value={gridConfig.columns}
                                        onChange={(e) => setGridConfig(prev => ({ ...prev, columns: Math.max(1, parseInt(e.target.value) || 12) }))}
                                        style={{ width: 40, padding: '2px 4px', background: '#0f172a', border: '1px solid #334155', borderRadius: 3, color: '#e2e8f0', fontSize: 10 }}
                                    />
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#94a3b8' }}>
                                    Gap:
                                    <input
                                        type="number"
                                        value={gridConfig.gap}
                                        onChange={(e) => setGridConfig(prev => ({ ...prev, gap: Math.max(0, parseInt(e.target.value) || 0) }))}
                                        style={{ width: 40, padding: '2px 4px', background: '#0f172a', border: '1px solid #334155', borderRadius: 3, color: '#e2e8f0', fontSize: 10 }}
                                    />
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Status */}
                    <div style={{ padding: '6px 12px', borderBottom: '1px solid #334155', fontSize: 10, color: '#64748b' }}>
                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>{boxes.length}</span> elements |
                        Scale: <span style={{ color: '#94a3b8', fontWeight: 600 }}>{(scaleFactor * 100).toFixed(0)}%</span>
                    </div>

                    {/* Selected Box Info */}
                    {selectedBox && (
                        <div style={{ padding: '8px 12px', borderBottom: '1px solid #334155', background: 'rgba(245, 158, 11, 0.1)' }}>
                            <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, marginBottom: 4 }}>
                                Selected: <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: 2, fontSize: 9 }}>{selectedBox.label}</code>
                            </div>
                            {mode === 'fixed' ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, fontSize: 9, color: '#94a3b8' }}>
                                    <span>X: {selectedBox.fixed.left.toFixed(1)}%</span>
                                    <span>Y: {selectedBox.fixed.top.toFixed(1)}%</span>
                                    <span>W: {selectedBox.fixed.width.toFixed(1)}%</span>
                                    <span>H: {selectedBox.fixed.height.toFixed(1)}%</span>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, fontSize: 9, color: '#94a3b8' }}>
                                    <span>Row: {selectedBox.grid.row}</span>
                                    <span>Col: {selectedBox.grid.column}</span>
                                    <span>RSpan: {selectedBox.grid.rowSpan}</span>
                                    <span>CSpan: {selectedBox.grid.colSpan}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Buttons */}
                    <div style={{ padding: '8px 12px', display: 'flex', gap: 8, borderBottom: '1px solid #334155' }}>
                        <button
                            onClick={resetAll}
                            style={{
                                flex: 1,
                                padding: '6px 12px',
                                background: '#dc2626',
                                border: 'none',
                                borderRadius: 4,
                                color: 'white',
                                fontSize: 10,
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            RESET
                        </button>
                        <button
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(exportJson, null, 2))}
                            style={{
                                flex: 1,
                                padding: '6px 12px',
                                background: '#2563eb',
                                border: 'none',
                                borderRadius: 4,
                                color: 'white',
                                fontSize: 10,
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            COPY JSON
                        </button>
                    </div>

                    {/* JSON Preview */}
                    <pre
                        style={{
                            margin: 0,
                            padding: 12,
                            fontSize: 9,
                            fontFamily: 'monospace',
                            color: '#4ade80',
                            background: '#020617',
                            overflow: 'auto',
                            maxHeight: 150,
                            flex: 1,
                        }}
                        onWheel={(e) => e.stopPropagation()}
                    >
                        {JSON.stringify(exportJson, null, 2)}
                    </pre>
                </div>
            </>
        );

        // Use portal to render at document body level
        return typeof document !== 'undefined' ? createPortal(overlayContent, document.body) : null;
    }, [isDesignerMode, containerBounds, boxes, selectedId, mode, gridConfig, scaleFactor, getBoxPosition, handleMouseDown, exportJson, resetAll, toggleDesignerMode]);

    return {
        containerRef,
        isDesignerMode,
        DesignerOverlay,
        boxes,
        mode,
        setMode,
        gridConfig,
        setGridConfig,
        exportJson,
        resetAll,
        selectedId,
        setSelectedId,
    };
}
