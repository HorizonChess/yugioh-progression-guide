# Fixed App Scale - Progress Tracker

## A. Current State

The app's layout is designed for desktop resolution (~1365px wide). On smaller screens (laptop without external monitor), the layout breaks:
- Buttons don't align the same way on laptop vs desktop
- Some elements like the info panel in deck builder get so small they disappear (likely flex shrinking)
- When connected to a larger screen via HDMI, the laptop correctly shows desktop proportions

**Goal:** Maintain exact desktop layout proportions when scaling to smaller screens, rather than reflowing/breaking.

---

## B. Previous Attempts (Failed)

### Attempt 1: CSS transform: scale() wrapper

**Code:**
```javascript
width: 1365,
minHeight: "100vh",
transform: `scale(${scale})`,
transformOrigin: "top left"
```

**Why it failed:** `transform: scale()` only changes the visual representation, not the actual document flow. The browser still allocates the original 1365px space, causing:
- White/empty areas where scaled content doesn't reach
- Overflow and clipping issues
- Layout elements positioned incorrectly

---

### Attempt 2: CSS zoom property

**Code:**
```javascript
width: 1365,
minHeight: `${100 / zoom}vh`,
zoom: zoom
```

**Why it failed:** While `zoom` does affect layout computation (unlike transform), it still doesn't prevent Tailwind's responsive breakpoints from evaluating against the actual `window.innerWidth`. The browser still reports the real viewport size to media queries.

---

### Attempt 3: Viewport meta tag

**Code:**
```typescript
export const viewport: Viewport = {
  width: 1365,
  initialScale: 1,
};
```

**Why it failed:** The viewport meta tag only works on mobile browsers. Desktop browsers (Chrome, Firefox, Edge on Windows/Mac) ignore fixed viewport widths - they always use the actual window size for layout and media queries.

---

### Attempt 4: position: fixed + transform: scale()

**Code:**
```javascript
position: "fixed",
width: 1365,
height: 911,
transform: `scale(${scale})`,
transformOrigin: "top left"
```

**Why it failed:** Same core issue as Attempt 1. Even with `position: fixed`, the transform still only affects visual rendering. The children inside still see their container as 1365x911, but any CSS that depends on viewport units (vh, vw) or responsive breakpoints still evaluates against the real viewport.

---

### The Core Problem

Tailwind/CSS media queries always check `window.innerWidth` - there's no way to "lie" to them from a wrapper component. The browser's viewport size is reported truthfully to all CSS, regardless of what container you put around the content. This is a fundamental limitation of how CSS works in browsers.

---

## C. Fix Attempts Log

### Attempt 5: ScaleWrapper with width-only scaling (1365px - WRONG WIDTH)

- **Date:** 2025-12-16
- **Approach:** Two-wrapper system scaling by width only
- **Status:** FAILED
- **Result:** White space on RIGHT side. Discovered 1365px was wrong - measured with DevTools open! Actual desktop is 1920px (1080p monitor).

---

### Attempt 6: ScaleWrapper with correct width (1920px) - CLOSEST SUCCESS

- **Date:** 2025-12-16
- **Approach:** Same as Attempt 5 but with DESIGN_WIDTH = 1920
- **Status:** PARTIAL SUCCESS
- **Result:**
  - Desktop: Looked correct
  - Laptop: White space at BOTTOM on some pages (deck builder, menu)
  - Collection page worked correctly
  - Issue: Pages using `h-screen` (100vh) reference real viewport, not scaled container

---

### Attempt 7: Fixed 1920x1080 canvas with letterboxing

- **Date:** 2025-12-16
- **Approach:** Fixed both width AND height to 1920x1080, scale by `Math.min(scaleX, scaleY)`, center content
- **Status:** FAILED
- **Result:**
  - Created letterboxing even on desktop (unwanted)
  - White space still at bottom on some pages
  - Proportions correct but too much dead screen space

---

### Attempt 8: CSS variable override for h-screen

- **Date:** 2025-12-16
- **Approach:**
  - Set `--design-vh` CSS variable to 10.8px (1080/100)
  - Override `.h-screen` class to use `calc(var(--design-vh) * 100)`
  - Width-only scaling with minHeight instead of fixed height
- **Status:** FAILED
- **Result:**
  - Made ALL pages scrollable (bad!)
  - White space appears when scrolling on laptop
  - Broke more than it fixed

---

### Attempt 9: Width-only scaling + Fixed pixel heights on affected pages

- **Date:** 2025-12-16
- **Approach:**
  1. ScaleWrapper: Width-only scaling (no height constraints, no CSS variable hacks)
  2. Pages using `h-screen`: Changed to `h-[1080px]` (fixed pixel height based on design)
  3. Pages using `min-h-screen` that don't fill naturally: Changed to `min-h-[1080px]`
- **Status:** FAILED
- **Result:** Fixed pixel heights (1080px) caused scrolling even on desktop because browser viewport < 1080px due to browser chrome (address bar, tabs, etc.)

---

### Attempt 10: Dynamic height compensation in ScaleWrapper

- **Date:** 2025-12-16
- **Approach:**
  - Inner wrapper minHeight changed from `100vh` to `${100/scale}vh`
  - Reverted all page changes back to `h-screen` / `min-h-screen`
- **Files modified:**
  - `ScaleWrapper.tsx` - `minHeight: "100vh"` → `minHeight: \`${100 / scale}vh\``
  - `deck-builder/page.tsx` - Reverted `h-[1080px]` → `h-screen`
  - `packs/page.tsx` - Reverted `h-[1080px]` → `h-screen`
  - `menu/page.tsx` - Reverted `min-h-[1080px]` → `min-h-screen`
- **Status:** FAILED
- **Result:** Still had white space at bottom on smaller viewports.

---

### Attempt 11: Fixed canvas with transform scale (per-page) - SUCCESS

- **Date:** 2025-12-16
- **Approach:** Inspired by Dueling Book's approach - fixed pixel dimensions with uniform scaling
  1. Define design dimensions: `DESIGN_WIDTH = 1920`, `DESIGN_HEIGHT = 911`
  2. Calculate scale: `Math.min(viewportWidth / DESIGN_WIDTH, viewportHeight / DESIGN_HEIGHT, 1)`
  3. Outer container: `100vw × 100vh`, `overflow: hidden`, `position: relative`
  4. Inner container: Fixed `1920 × 911` pixels, `transform: scale(zoom)`, `position: absolute`
  5. Content uses `h-full` instead of `h-screen` (references the fixed container, not viewport)
- **Code:**
```tsx
// Design dimensions
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 911;

// Calculate zoom
const [zoom, setZoom] = useState(1);
useEffect(() => {
    function updateZoom() {
        const scale = Math.min(
            window.innerWidth / DESIGN_WIDTH,
            window.innerHeight / DESIGN_HEIGHT,
            1
        );
        setZoom(scale);
    }
    updateZoom();
    window.addEventListener('resize', updateZoom);
    return () => window.removeEventListener('resize', updateZoom);
}, []);

// JSX structure
<div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
    <div style={{
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        position: 'absolute',
        top: 0,
        left: 0,
    }}>
        <div className="h-full ...">
            {/* Page content */}
        </div>
    </div>
</div>
```
- **Status:** SUCCESS
- **Result:**
  - Desktop (1920×911): scale = 1, looks exactly as designed
  - Laptop (smaller viewport): scales down uniformly, all proportions maintained
  - No white space, no overflow issues
  - Card info panel, buttons, and all elements scale proportionally

---

### Attempt 12: Remove scale cap (allow scale > 1)

- **Date:** 2025-12-17
- **Approach:** Same as Attempt 11 but remove the `1` cap from Math.min
  - `scale = Math.min(vw / DESIGN_WIDTH, vh / DESIGN_HEIGHT)` (no cap)
- **Status:** FAILED
- **Result:** Zoom out now works correctly, but RIGHT margin still present on laptop at 100% zoom

---

### Attempt 13: Width-only scaling (revisit Attempt 6 with h-full)

- **Date:** 2025-12-17
- **Approach:** Return to Attempt 6's width-only scaling, but keep h-full from Attempt 11
  - `scale = vw / DESIGN_WIDTH` (no height consideration)
  - Pages still use `h-full` instead of `h-screen`
- **Difference from Attempt 6:** Pages now use `h-full` (fixed by Attempt 11), avoiding the bottom space issue
- **Rationale:** Ensures content ALWAYS fills viewport width exactly
- **Status:** FAILED
- **Result:** Eliminated right margin but content clips at bottom on laptop (695px viewport height)

---

### Attempt 14: Adaptive height (dynamic DESIGN_HEIGHT) - SUCCESS ✓

- **Date:** 2025-12-17
- **Approach:** Scale by width, but calculate height dynamically to fill viewport exactly
  - `scale = vw / DESIGN_WIDTH` (width determines scale)
  - `designHeight = vh / scale` (height adapts to fill viewport)
  - Inner container uses dynamic height instead of fixed 911px
- **Code:**
```tsx
const DESIGN_WIDTH = 1920;
const scale = vw / DESIGN_WIDTH;
const designHeight = vh / scale;
// Inner container: width=1920, height=designHeight (dynamic)
```
- **Status:** SUCCESS ✓
- **Result:**
  - Desktop: Fills viewport exactly, no margins
  - Laptop: Fills viewport exactly, no margins, no clipping
  - All proportions maintained horizontally (width-based scaling)

---

## D. Analysis (Updated)

### Why Attempt 14 Works (and others failed)

**The Core Problem with Fixed Dimensions:**

When BOTH width and height are fixed (e.g., 1920×911), and the viewport has a DIFFERENT aspect ratio, you face an impossible choice:

| Approach | Result |
|----------|--------|
| Math.min (fit/contain) | Margins on one dimension |
| Math.max (cover) | Clipping on one dimension |
| Width-only + fixed height | Right margin OR bottom clipping |

**The Key Insight:**

Only fix ONE dimension (width), and let the other (height) ADAPT to the viewport.

**The Math:**

For ANY viewport (vw × vh):
```
scale = vw / 1920
designHeight = vh / scale

Scaled width  = 1920 × scale = 1920 × (vw/1920) = vw  ✓ (fills exactly)
Scaled height = designHeight × scale = (vh/scale) × scale = vh  ✓ (fills exactly)
```

**Why This Works Universally:**

| Viewport | Scale | Design Height | Result |
|----------|-------|---------------|--------|
| 1920×911 (desktop) | 1.0 | 911px | 1920×911 → fills |
| 1536×695 (laptop) | 0.8 | 869px | 1536×695 → fills |
| 2560×1440 (1440p) | 1.33 | 1080px | 2560×1440 → fills |
| 1280×720 (720p) | 0.67 | 1080px | 1280×720 → fills |
| 3840×2160 (4K) | 2.0 | 1080px | 3840×2160 → fills |

**Why Previous Attempts Failed:**

1. **Attempts 1-4:** Used transform scale but with viewport units inside (h-screen) - browser evaluates vh against real viewport, not container
2. **Attempts 5-6:** Width-only but pages used h-screen - same issue
3. **Attempt 7:** Fixed both dimensions with Math.min - caused letterboxing
4. **Attempt 11:** Fixed 1920×911 with Math.min - worked when aspect ratios matched, failed when they didn't (laptop is wider: 1536/695=2.21 vs 1920/911=2.11)
5. **Attempt 12:** Removed cap but still Math.min - height constrained, left right margin
6. **Attempt 13:** Width-only with fixed height - filled width but clipped bottom

**The Solution (Attempt 14):**

1. **Fix width only:** `DESIGN_WIDTH = 1920` (all horizontal layouts are based on this)
2. **Scale by width:** `scale = vw / 1920` (ensures horizontal elements fill exactly)
3. **Adapt height:** `designHeight = vh / scale` (calculated to fill viewport after scaling)
4. **Flexible content:** Content uses `h-full` and flexbox, naturally adapts to any height

**Requirements for Content:**

- Use `h-full` instead of `h-screen` or fixed pixel heights
- Use flexbox with `flex-1` for sections that should grow/shrink
- Avoid hardcoded pixel heights for major layout sections

---

## E. Final Solution Summary

```tsx
// ScaleWrapper.tsx - The working solution
const DESIGN_WIDTH = 1920;

function updateZoom() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Scale by width - horizontal layout is preserved
    const scale = vw / DESIGN_WIDTH;

    // Height adapts to fill viewport
    const designHeight = vh / scale;

    // Container: 1920 × designHeight, scaled by 'scale'
    // Result: vw × vh (exact viewport fill)
}
```

**This works on ANY screen** because:
- Width scaling ensures all horizontal positions/proportions are exact
- Height adapts, and flex layouts adjust to available space
- No aspect ratio assumptions - works with any ratio

---

## F. References

- [CSS-Tricks: Scaled/Proportional Content](https://css-tricks.com/scaled-proportional-blocks-with-css-and-javascript/)
- [Medium: Emulating CSS Zoom with Transform Scale](https://medium.com/@sai_prasanna/simulating-css-zoom-with-css3-transform-scale-461d1b9762d6)
