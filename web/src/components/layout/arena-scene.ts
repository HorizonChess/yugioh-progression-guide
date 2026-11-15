/**
 * The Bots Arena's wall in three.js (desktop): the camera starts straight on to the wall every page
 * shows, goes along it to its corner and round it, to the arena's wall, lit by a torch. The page's
 * wall is the plane x = 0 (facing -x, its stretch z -9..0 the page's background exactly); the
 * arena's is z = 0 (facing +z, from the corner on into the distance). Metres.
 *
 * The carved stone is a parallax-occlusion shader whose relief shadows itself toward each light.
 * The canvas's first frame is the page's own background (its CSS filter and vignette, redrawn),
 * which then crossfades into the 3D wall before the camera moves: so it takes over without a jump.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export type ArenaScene = {
    /** Plays the move into the arena (or jumps there), then keeps the torch burning. */
    enter: (instant?: boolean) => void;
    /** Plays the move back out; resolves once it's the page's wall again (the canvas can go). */
    leave: (instant?: boolean) => Promise<void>;
    dispose: () => void;
};

const TEX_W = 9, WALL_H = (9 * 1072) / 1920;   // one copy of the wall's picture: 9 m wide
const FOV = 48;
const FADE_IN = 0.2, CROSS = 0.5, MOVE = 3.2;   // seconds: the canvas appears, the page becomes 3D, the camera moves

const stoneVert = /* glsl */ `
    varying vec3 vWorld;
    #include <fog_pars_vertex>
    void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
    }`;
const stoneFrag = /* glsl */ `
    uniform sampler2D uAlbedo, uNormal, uHeight;
    uniform mat3 uTBN;            // columns: the surface's x, y and normal, in world space
    uniform vec3 uOrigin;         // the world point at uv (0, 0)
    uniform vec2 uTexSize, uTexOffset;
    uniform float uDepth, uNormalStrength;
    uniform vec3 uTint;
    uniform vec3 uLightPos[3], uLightColor[3], uAmbient;
    uniform float uLightPower[3];
    varying vec3 vWorld;
    #include <fog_pars_fragment>
    #define PI 3.14159265

    vec2 gdx, gdy;
    float depthAt(vec2 uv) { return 1.0 - textureGrad(uHeight, uv, gdx, gdy).r; }   // 0 the face, 1 the deepest cut

    vec3 lightFrom(vec3 lightPos, vec3 power, vec3 Ph, vec3 n, vec3 V, vec3 albedo, mat3 toLocal) {
        vec3 Ll = toLocal * (lightPos - uOrigin) - Ph;
        float dist = length(Ll); vec3 L = Ll / dist;
        if (L.z <= 0.0) return vec3(0.0);
        float tEnd = -Ph.z / L.z, pen = 0.0;
        for (int j = 1; j <= 24; j++) {
            float t = tEnd * float(j) / 24.0;
            vec3 p = Ph + L * t;
            float surf = -depthAt(p.xy / uTexSize + uTexOffset) * uDepth;
            pen = max(pen, (surf - p.z) / (t + 0.002));
        }
        float shadow = mix(1.0, 0.12, smoothstep(0.0, 0.7, pen));
        float ndl = max(dot(n, L), 0.0);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(n, H), 0.0), 24.0) * 0.06 * (0.3 + 0.7 * pow(1.0 - max(dot(V, H), 0.0), 5.0));
        return (albedo / PI * ndl + spec) * power / pow(dist, 1.1) * shadow;
    }

    void main() {
        mat3 toLocal = transpose(uTBN);
        vec3 P = toLocal * (vWorld - uOrigin);
        vec3 V = normalize(toLocal * (cameraPosition - vWorld));
        vec2 uv0 = P.xy / uTexSize + uTexOffset;
        gdx = dFdx(uv0); gdy = dFdy(uv0);
        const int STEPS = 48;
        float layer = 1.0 / float(STEPS);
        vec3 rd = -V; rd.z = min(rd.z, -0.12);
        vec2 dUV = (rd.xy / -rd.z) * (uDepth * layer) / uTexSize;
        vec2 uv = uv0; float cur = 0.0; float d = depthAt(uv);
        for (int i = 0; i < STEPS; i++) { if (cur >= d) break; uv += dUV; cur += layer; d = depthAt(uv); }
        vec2 prevUV = uv - dUV; float after = d - cur, before = depthAt(prevUV) - (cur - layer);
        float w = clamp(after / (after - before + 1e-5), 0.0, 1.0);
        uv = mix(uv, prevUV, w);
        float hitDepth = mix(cur, cur - layer, w);
        vec3 Ph = vec3((uv - uTexOffset) * uTexSize, -hitDepth * uDepth);
        vec3 n = textureGrad(uNormal, uv, gdx, gdy).xyz * 2.0 - 1.0;
        n.xy *= uNormalStrength; n = normalize(n);
        vec3 albedo = textureGrad(uAlbedo, uv, gdx, gdy).rgb * uTint;
        vec3 col = albedo * uAmbient * mix(0.35, 1.0, 1.0 - hitDepth);
        for (int k = 0; k < 3; k++) col += lightFrom(uLightPos[k], uLightColor[k] * uLightPower[k], Ph, n, V, albedo, toLocal);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
    }`;

/** The last pass (sRGB in, sRGB out): the page's own background drawn as the page draws it, crossfaded with the 3D; the vignette. */
const finalFrag = /* glsl */ `
    uniform sampler2D tDiffuse, uPage;
    uniform float uMix, uArena, uAspect, uPageAspect, uGrade;
    varying vec2 vUv;
    vec3 sat(vec3 c, float s) {   // CSS saturate()
        mat3 m = mat3(0.213 + 0.787 * s, 0.213 - 0.213 * s, 0.213 - 0.213 * s,
                      0.715 - 0.715 * s, 0.715 + 0.285 * s, 0.715 - 0.715 * s,
                      0.072 - 0.072 * s, 0.072 - 0.072 * s, 0.072 + 0.928 * s);
        return m * c;
    }
    void main() {
        vec2 top = vec2(vUv.x, 1.0 - vUv.y);                         // CSS coordinates: y down
        // the page's vignette: radial-gradient(ellipse 70% 60% at 50% 40%, .25 -> .72)
        float r = min(length((top - vec2(0.5, 0.4)) / vec2(0.7, 0.6)), 1.0);
        float pageVig = mix(0.25, 0.72, r);
        // the arena's: lighter, so the torch at the left isn't lost
        float arenaVig = mix(0.12, 0.6, smoothstep(0.25, 1.0, r));
        vec3 scene = texture2D(tDiffuse, vUv).rgb;
        // at the start the stone takes the page's amber (its colour is the page's), letting go as the camera turns
        float lum = dot(scene, vec3(0.299, 0.587, 0.114));
        scene = mix(scene, lum * vec3(1.62, 0.8, 0.07), uGrade * (1.0 - uArena));
        scene *= 1.0 - mix(pageVig, arenaVig, uArena);
        // the page's wall: background-size cover, centred; filter: brightness(1.15) contrast(1.15) saturate(1.05)
        vec2 uv = top;
        if (uAspect > uPageAspect) uv.y = 0.5 + (uv.y - 0.5) * uPageAspect / uAspect; else uv.x = 0.5 + (uv.x - 0.5) * uAspect / uPageAspect;
        vec3 page = texture2D(uPage, vec2(uv.x, 1.0 - uv.y)).rgb;
        page = clamp(page * 1.15, 0.0, 1.0);
        page = clamp((page - 0.5) * 1.15 + 0.5, 0.0, 1.0);
        page = clamp(sat(page, 1.05), 0.0, 1.0) * (1.0 - pageVig);
        gl_FragColor = vec4(mix(scene, page, uMix), 1.0);
    }`;

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// layered sines: the torches' flicker
const noise = (t: number) => Math.sin(t * 1.7) * 0.5 + Math.sin(t * 3.9 + 1.3) * 0.3 + Math.sin(t * 9.1 + 0.7) * 0.2 + Math.sin(t * 17.3 + 2.1) * 0.12;

export async function createArenaScene(canvas: HTMLCanvasElement, url: (path: string) => string): Promise<ArenaScene> {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    const dpr = Math.min(window.devicePixelRatio, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const loader = new THREE.TextureLoader();
    const tex = (path: string, srgb: boolean, wrap: THREE.Wrapping = THREE.MirroredRepeatWrapping) =>
        loader.loadAsync(url(path)).then((t) => {
            t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            t.wrapS = t.wrapT = wrap;
            t.anisotropy = renderer.capabilities.getMaxAnisotropy();
            return t;
        });
    const D = "/ui/bots-arena/3d/";
    const [albedo, normal, height, flameAtlas, fA, fN, fH, pageWall] = await Promise.all([
        tex(D + "wall-albedo.webp", true), tex(D + "wall-normal.webp", false), tex(D + "wall-height.webp", false), tex(D + "flame.webp", true, THREE.ClampToEdgeWrapping),
        tex(D + "floor-albedo.webp", true, THREE.RepeatWrapping), tex(D + "floor-normal.webp", false, THREE.RepeatWrapping), tex(D + "floor-height.webp", false, THREE.RepeatWrapping),
        // (the page's wall as raw sRGB numbers: the last pass works in the page's colours)
        tex("/bg-wall.webp", false, THREE.ClampToEdgeWrapping),
    ]);

    const scene = new THREE.Scene();
    const FOG = new THREE.Color(0x070302);
    scene.background = FOG.clone();
    scene.fog = new THREE.FogExp2(FOG, 0.03);
    const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.05, 200);

    // ---- lights: the torch by the corner, the next one down the hall, and the one the page's wall is seen in
    const TORCH = new THREE.Vector3(0.45, 0, 0.5), FLAME_Y = 1.86;
    const warm = new THREE.Color("#ffa865");
    const torchLight = new THREE.PointLight(warm, 11, 0, 2);
    torchLight.position.set(TORCH.x, FLAME_Y + 0.12, TORCH.z);
    const hallLight = new THREE.PointLight(warm, 7, 0, 2);
    hallLight.position.set(9.5, 1.95, 0.9);
    const PAGE_POWER = 11.5;
    const pageLight = new THREE.PointLight(new THREE.Color("#ffb070"), PAGE_POWER, 0, 2);
    // (in front of the middle of the page's stretch of wall, a little high: the page's pool of light)
    pageLight.position.set(-2.6, 3.3, -4.6);
    scene.add(torchLight, hallLight, pageLight);
    const ambient = new THREE.Color(0x1a1420).multiplyScalar(0.25);
    scene.add(new THREE.AmbientLight(ambient, 1));

    // ---- the stone
    const walls: THREE.ShaderMaterial[] = [];
    type StoneOpts = { tbn: number[]; origin: number[]; texSize?: number[]; offset?: number[]; depth?: number; normalStrength?: number; tint?: number[]; maps?: THREE.Texture[] };
    const stone = ({ tbn, origin, texSize = [TEX_W, WALL_H], offset = [0, 0], depth = 0.045, normalStrength = 1, tint = [1, 1, 1], maps = [albedo, normal, height] }: StoneOpts) => {
        const m = new THREE.ShaderMaterial({
            vertexShader: stoneVert, fragmentShader: stoneFrag, fog: true,
            uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
                uTBN: { value: new THREE.Matrix3().set(...(tbn as [number, number, number, number, number, number, number, number, number])) },
                uOrigin: { value: new THREE.Vector3(...origin) }, uTexSize: { value: new THREE.Vector2(...texSize) }, uTexOffset: { value: new THREE.Vector2(...offset) },
                uDepth: { value: depth }, uNormalStrength: { value: normalStrength }, uTint: { value: new THREE.Vector3(...tint) },
                uLightPower: { value: [0, 0, 0] }, uAmbient: { value: new THREE.Vector3(ambient.r, ambient.g, ambient.b) },
            }]),
        });
        // (set after the merge, which would clone them)
        m.uniforms.uAlbedo = { value: maps[0] }; m.uniforms.uNormal = { value: maps[1] }; m.uniforms.uHeight = { value: maps[2] };
        m.uniforms.uLightPos = { value: [torchLight.position, hallLight.position, pageLight.position] };
        m.uniforms.uLightColor = { value: [torchLight.color, hallLight.color, pageLight.color] };
        walls.push(m);
        return m;
    };
    const plane = (w: number, h: number, mat: THREE.Material, pos: number[], rotY = 0, rotX = 0) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        m.position.set(pos[0]!, pos[1]!, pos[2]!); m.rotation.set(rotX, rotY, 0); scene.add(m);
    };
    // (Matrix3.set takes rows: a row per world axis; the columns are the surface's x, y and normal.)
    const B_TBN = [1, 0, 0, 0, 1, 0, 0, 0, 1], A_TBN = [0, 0, -1, 0, 1, 0, 1, 0, 0];
    plane(40, WALL_H, stone({ tbn: B_TBN, origin: [0, 0, 0] }), [20, WALL_H / 2, 0]);
    plane(40, 6, stone({ tbn: B_TBN, origin: [0, WALL_H, 0], offset: [0.37, 0.02], depth: 0.02, normalStrength: 0.4, tint: [0.8, 0.75, 0.7] }), [20, WALL_H + 3, 0]);
    plane(20, WALL_H, stone({ tbn: A_TBN, origin: [0, 0, -9] }), [0, WALL_H / 2, -10], -Math.PI / 2);
    plane(20, 6, stone({ tbn: A_TBN, origin: [0, WALL_H, -9], offset: [0.37, 0.02], depth: 0.02, normalStrength: 0.4, tint: [0.8, 0.75, 0.7] }), [0, WALL_H + 3, -10], -Math.PI / 2);
    plane(60, 30, stone({ tbn: [1, 0, 0, 0, 0, 1, 0, -1, 0], origin: [-10, 0, 15], texSize: [4.5, 4.5], depth: 0.025, normalStrength: 0.8, tint: [0.62, 0.56, 0.5], maps: [fA, fN, fH] }), [20, 0, 0], 0, -Math.PI / 2);
    // the corner's rounded edge (a torus moulding, as temple corners have)
    const cornerMap = fA.clone(); cornerMap.repeat.set(0.12, 2.5);
    const cornerN = fN.clone(); cornerN.repeat.set(0.12, 2.5);
    const corner = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 12, 48, 1, true),
        new THREE.MeshStandardMaterial({ map: cornerMap, normalMap: cornerN, normalScale: new THREE.Vector2(0.6, 0.6), color: new THREE.Color(0.36, 0.3, 0.24), roughness: 0.95, metalness: 0 }));
    corner.position.set(0, 6, 0);
    scene.add(corner);

    // ---- the torch: a bronze cup on a tripod, its flame (a fire video's frames, keyed), a glow, embers
    const bronze = new THREE.MeshStandardMaterial({ color: 0x3a2414, metalness: 0.75, roughness: 0.42 });
    const torch = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.06, 0.04], [0.085, 0.2], [0.12, 0.34], [0.14, 0.4], [0.135, 0.41], [0.11, 0.37]].map(([x, y]) => new THREE.Vector2(x, y)), 48), bronze);
    cup.position.y = 1.47; torch.add(cup);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 12, 48), bronze); band.rotation.x = Math.PI / 2; band.position.y = 1.6; torch.add(band);
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.118, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 1.4, 0.35) }));
    coals.rotation.x = -Math.PI / 2; coals.position.y = 1.855; torch.add(coals);
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const top = new THREE.Vector3(Math.cos(a) * 0.045, 1.48, Math.sin(a) * 0.045), foot = new THREE.Vector3(Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, top.distanceTo(foot), 10), bronze);
        leg.position.copy(top).add(foot).multiplyScalar(0.5); leg.lookAt(top); leg.rotateX(Math.PI / 2); torch.add(leg);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.01, 10, 40), bronze); ring.rotation.x = Math.PI / 2; ring.position.y = 0.75; torch.add(ring);
    torch.position.set(TORCH.x, 0, TORCH.z);
    scene.add(torch);

    const billboard = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    const flameMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uAtlas: { value: flameAtlas }, uFrame: { value: 0 } },
        vertexShader: billboard,
        fragmentShader: /* glsl */ `
            uniform sampler2D uAtlas; uniform float uFrame; varying vec2 vUv;
            vec4 cell(float f) { f = mod(f, 40.0); float c = mod(f, 8.0), r = floor(f / 8.0);
                return texture2D(uAtlas, vec2((c + vUv.x) / 8.0, 1.0 - (r + 1.0 - vUv.y) / 5.0)); }
            void main() {
                vec4 a = mix(cell(floor(uFrame)), cell(floor(uFrame) + 1.0), smoothstep(0.0, 1.0, fract(uFrame)));
                float l = max(a.r, max(a.g, a.b));
                vec3 hot = mix(vec3(1.0, 0.35, 0.06), vec3(1.0, 0.85, 0.55), smoothstep(0.35, 0.95, l));
                gl_FragColor = vec4(hot * l * 2.6 * a.a, 1.0);
            }`,
    });
    const FW = 0.42, FH = (0.42 * 192) / 88;
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), flameMat);
    flame.position.set(TORCH.x, 1.83 + FH / 2, TORCH.z);
    scene.add(flame);
    const glowMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uI: { value: 1 } },
        vertexShader: billboard,
        fragmentShader: `uniform float uI; varying vec2 vUv; void main() { float d = length(vUv - 0.5) * 2.0; float g = exp(-d * d * 7.0) * 0.5 + exp(-d * d * 40.0) * 0.8;
            gl_FragColor = vec4(vec3(1.0, 0.42, 0.12) * g * uI * 0.55, 1.0); }`,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), glowMat);
    glow.position.set(TORCH.x, FLAME_Y + 0.1, TORCH.z);
    scene.add(glow);

    const EMBERS = 260;
    const eGeo = new THREE.BufferGeometry();
    const ePos = new Float32Array(EMBERS * 3), eLife = new Float32Array(EMBERS), eSeed = new Float32Array(EMBERS);
    const eVel = Array.from({ length: EMBERS }, () => new THREE.Vector3());
    const spawn = (i: number, age = 0) => {
        ePos[i * 3] = TORCH.x + (Math.random() - 0.5) * 0.18; ePos[i * 3 + 1] = FLAME_Y + Math.random() * 0.25; ePos[i * 3 + 2] = TORCH.z + (Math.random() - 0.5) * 0.18;
        eVel[i]!.set((Math.random() - 0.5) * 0.35, 0.35 + Math.random() * 0.9, (Math.random() - 0.5) * 0.35);
        eLife[i] = age; eSeed[i] = Math.random();
    };
    for (let i = 0; i < EMBERS; i++) spawn(i, Math.random() * 3);
    eGeo.setAttribute("position", new THREE.BufferAttribute(ePos, 3));
    eGeo.setAttribute("life", new THREE.BufferAttribute(eLife, 1));
    eGeo.setAttribute("seed", new THREE.BufferAttribute(eSeed, 1));
    const emberMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uScale: { value: window.innerHeight * dpr } },
        vertexShader: /* glsl */ `attribute float life, seed; uniform float uTime, uScale; varying float vA;
            void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
                float fade = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(1.2 + seed * 1.6, 1.6 + seed * 2.0, life));
                vA = fade * (0.6 + 0.4 * sin(uTime * 25.0 + seed * 40.0));
                gl_PointSize = (0.016 + 0.026 * seed) * uScale / -mv.z; }`,
        fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vec3(5.0, 1.8, 0.45) * exp(-d * d * 4.0) * vA, 1.0); }`,
    });
    scene.add(new THREE.Points(eGeo, emberMat));
    const stepEmbers = (t: number, dt: number) => {
        for (let i = 0; i < EMBERS; i++) {
            eLife[i]! += dt;
            if (eLife[i]! > 3.6) spawn(i);
            const v = eVel[i]!;
            v.x += Math.sin(t * 2 + eSeed[i]! * 30) * 0.4 * dt; v.z += Math.cos(t * 1.7 + eSeed[i]! * 20) * 0.3 * dt; v.y -= 0.12 * dt;
            ePos[i * 3]! += v.x * dt; ePos[i * 3 + 1]! += v.y * dt; ePos[i * 3 + 2]! += v.z * dt;
        }
        eGeo.attributes.position!.needsUpdate = true; eGeo.attributes.life!.needsUpdate = true;
    };
    for (let k = 0; k < 90; k++) stepEmbers(k / 30, 1 / 30);

    // ---- post: bloom, ACES, then the last pass (the page's background, the vignette)
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    composer.setPixelRatio(dpr);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.5, 1.0);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const final = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, uPage: { value: pageWall }, uMix: { value: 1 }, uArena: { value: 0 }, uAspect: { value: 1 }, uPageAspect: { value: 1920 / 1072 }, uGrade: { value: 0.85 } },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: finalFrag,
    });
    composer.addPass(final);

    // ---- the camera's path. Its start is the page's wall as the page shows it (cover): it depends on the screen's shape.
    let camPath!: THREE.CatmullRomCurve3, lookPath!: THREE.CatmullRomCurve3;
    const layout = () => {
        const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
        renderer.setSize(w, h, false); composer.setSize(w, h);
        camera.aspect = aspect; camera.updateProjectionMatrix();
        final.uniforms.uAspect!.value = aspect;
        emberMat.uniforms.uScale!.value = h * dpr;
        const halfV = THREE.MathUtils.degToRad(FOV / 2), halfH = Math.atan(Math.tan(halfV) * aspect);
        const d0 = Math.min(WALL_H / 2 / Math.tan(halfV), TEX_W / 2 / Math.tan(halfH));
        camPath = new THREE.CatmullRomCurve3([new THREE.Vector3(-d0, WALL_H / 2, -4.5), new THREE.Vector3(-3.6, 2.35, -1.2), new THREE.Vector3(-2.3, 2.05, 2.0), new THREE.Vector3(-0.75, 1.75, 4.4)], false, "centripetal");
        lookPath = new THREE.CatmullRomCurve3([new THREE.Vector3(0, WALL_H / 2, -4.5), new THREE.Vector3(0, 2.25, -1.4), new THREE.Vector3(1.4, 2.0, 0.2), new THREE.Vector3(2.85, 1.9, 1.7)], false, "centripetal");
    };
    layout();
    window.addEventListener("resize", layout);

    // ---- the timeline: where the camera is (0 the page's wall, 1 the arena's), and how much of the page is still drawn
    let progress = 0, target = 0, pageMix = 1, phaseStart = 0, from = 0;
    let onArrive: (() => void) | null = null;
    const pose = (p: number) => {
        const e = ease(clamp01(p));
        camera.position.copy(camPath.getPoint(e));
        camera.lookAt(lookPath.getPoint(e));
        return e;
    };

    let raf = 0, last = performance.now() / 1000, visible = true;
    const frame = () => {
        raf = requestAnimationFrame(frame);
        if (!visible) return;
        const t = performance.now() / 1000, dt = Math.min(0.05, t - last); last = t;
        const since = t - phaseStart;
        if (target === 1) {
            // in: the page crossfades into the 3D wall (the camera still), then the camera moves
            // (turning back mid-way out, it just goes on from where it is)
            const wait = from === 0 ? FADE_IN + CROSS : 0;
            if (from === 0) pageMix = Math.min(pageMix, 1 - smooth(FADE_IN, FADE_IN + CROSS, since));
            else pageMix = Math.min(pageMix, 1 - smooth(0, 0.3, since));
            progress = Math.max(progress, from + (1 - from) * clamp01((since - wait) / (MOVE * (1 - from))));
        } else {
            // out: the camera moves back, then the 3D wall becomes the page's again
            const back = MOVE * Math.max(from, 0.15);
            progress = Math.min(progress, from * (1 - clamp01(since / back)));
            if (progress <= 0) pageMix = Math.max(pageMix, smooth(back, back + CROSS, since));
            if (progress <= 0 && pageMix >= 1 && onArrive) { const done = onArrive; onArrive = null; done(); }
        }
        const e = pose(progress);
        const f = 1 + 0.13 * noise(t * 2.2) + 0.05 * noise(t * 7.7 + 3);
        torchLight.intensity = 11 * f;
        torchLight.position.set(TORCH.x + 0.025 * noise(t * 3.1 + 5), FLAME_Y + 0.12 + 0.03 * noise(t * 2.7 + 9), TORCH.z + 0.025 * noise(t * 2.9 + 1));
        hallLight.intensity = 7 * (1 + 0.12 * noise(t * 2.0 + 17));
        pageLight.intensity = PAGE_POWER * (0.3 + 0.7 * (1 - e)) * (1 + 0.06 * noise(t * 1.6 + 31));
        for (const m of walls) m.uniforms.uLightPower!.value = [torchLight.intensity, hallLight.intensity, pageLight.intensity];
        glowMat.uniforms.uI!.value = f;
        flameMat.uniforms.uFrame!.value = t * 12;
        flame.quaternion.copy(camera.quaternion); glow.quaternion.copy(camera.quaternion);
        stepEmbers(t, dt);
        emberMat.uniforms.uTime!.value = t;
        final.uniforms.uMix!.value = pageMix;
        final.uniforms.uArena!.value = e;
        composer.render();
    };
    const onVisibility = () => { visible = document.visibilityState === "visible"; last = performance.now() / 1000; };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);

    return {
        enter(instant = false) {
            target = 1; from = progress; phaseStart = performance.now() / 1000; onArrive = null;
            if (instant) { progress = 1; pageMix = 0; }
        },
        leave(instant = false) {
            target = 0; from = progress; phaseStart = performance.now() / 1000;
            if (instant) { progress = 0; pageMix = 1; return Promise.resolve(); }
            return new Promise<void>((resolve) => { onArrive = resolve; });
        },
        dispose() {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", layout);
            document.removeEventListener("visibilitychange", onVisibility);
            scene.traverse((o) => {
                const m = o as THREE.Mesh;
                m.geometry?.dispose();
                (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
            });
            [albedo, normal, height, flameAtlas, fA, fN, fH, pageWall, cornerMap, cornerN].forEach((t) => t.dispose());
            composer.dispose();
            renderer.dispose();
        },
    };
}
