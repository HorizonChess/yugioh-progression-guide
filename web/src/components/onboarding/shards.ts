// Breaking wax: the seal's picture is cut into shards that pop up, land on the desk
// (seen from above, so "height" shows as scale and shadow offset), skid and settle.

type Pt = { x: number; y: number };
type Shard = { poly: Pt[]; c: Pt; x: number; y: number; z: number; vx: number; vy: number; vz: number; a: number; va: number };

/** Draws the SVG element into an image, ready for `burst`. */
export function rasterize(svg: SVGSVGElement, size: number): Promise<HTMLImageElement> {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(size));
    clone.setAttribute("height", String(size));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

function cut(w: number): Shard[] {
    const R = w / 2;
    const angles = Array.from({ length: 7 }, (_, i) => (i / 7) * Math.PI * 2 + (Math.random() - 0.5) * 0.5);
    const at = (a: number, r: number) => ({ x: R + Math.cos(a) * r, y: R + Math.sin(a) * r });
    const inner = angles.map((a) => at(a, R * (0.38 + Math.random() * 0.14)));
    const shards: Pt[][] = [];
    angles.forEach((a, i) => {
        const b = angles[(i + 1) % 7]! + (i === 6 ? Math.PI * 2 : 0);
        const p = inner[i]!, q = inner[(i + 1) % 7]!;
        shards.push([{ x: R + (Math.random() - 0.5) * 6, y: R + (Math.random() - 0.5) * 6 }, p, q]);
        const arc = [0, 0.33, 0.66, 1].map((t) => at(a + (b - a) * t, R * 1.05));
        shards.push([p, ...arc, q]);
    });
    return shards.map((poly) => {
        const c = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
        const dx = c.x - R, dy = c.y - R, d = Math.hypot(dx, dy) || 1;
        const speed = 2.5 + Math.random() * 3.5;
        return { poly, c, x: 0, y: 0, z: 0, vx: (dx / d) * speed, vy: (dy / d) * speed, vz: 5 + Math.random() * 4, a: 0, va: (Math.random() - 0.5) * 0.35 };
    });
}

/** Shatters `img` (drawn over `rect`, in viewport pixels) onto `canvas`; resolves once the pieces have faded. */
export function burst(canvas: HTMLCanvasElement, img: HTMLImageElement, rect: DOMRect): Promise<void> {
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const shards = cut(rect.width);
    const k = rect.width / 2;
    const start = performance.now();

    return new Promise((resolve) => {
        const frame = (now: number) => {
            const t = (now - start) / 1000;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
            ctx.globalAlpha = Math.max(0, Math.min(1, (3.2 - t) / 0.8));
            for (const s of shards) {
                s.x += s.vx;
                s.y += s.vy;
                s.z += s.vz;
                s.vz -= 0.55;
                s.a += s.va;
                if (s.z <= 0) {
                    s.z = 0;
                    s.vz = Math.abs(s.vz) > 1.2 ? -s.vz * 0.32 : 0;
                    s.vx *= 0.82;
                    s.vy *= 0.82;
                    s.va *= 0.8;
                }
            }
            // Shadows first (each is the wax's own silhouette, offset by its height), then the pieces, lowest first.
            const order = [...shards].sort((a, b) => a.z - b.z);
            for (const shadow of [true, false]) {
                for (const s of order) {
                    const scale = 1 + s.z / k / 2.2;
                    ctx.save();
                    ctx.translate(rect.left + s.c.x + s.x + (shadow ? s.z * 0.5 + 1.5 : 0), rect.top + s.c.y + s.y + (shadow ? s.z * 0.8 + 2.5 : 0));
                    ctx.rotate(s.a);
                    ctx.scale(scale, scale);
                    ctx.beginPath();
                    s.poly.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p.x - s.c.x, p.y - s.c.y));
                    ctx.closePath();
                    ctx.clip();
                    if (shadow) ctx.filter = "brightness(0) opacity(0.45) blur(1px)";
                    ctx.drawImage(img, -s.c.x, -s.c.y, rect.width, rect.height);
                    ctx.restore();
                }
            }
            if (t < 3.2) requestAnimationFrame(frame);
            else {
                ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
                resolve();
            }
        };
        requestAnimationFrame(frame);
    });
}
