// Source: https://github.com/samasante/liquid-glass/blob/4e7b769e1df7e5a7d3669fef22417fe3d2f79ade/src/displacement.ts
// Copyright (c) 2026 Sam Asante. MIT license in LICENSE.
export const DEFAULT_LENS_PARAMS = {
    lensW: 95,
    lensH: 95,
    borderRadius: 95,
    mapSize: 512,
    clipToShape: true,
    softEdge: true,
    strength: 0.06,
    depth: 0.65,
    curvature: 0.6,
    splay: 0,
    dispersion: 0.5,
    bend: 0,
    bendWidth: 0.16,
    frost: 0.5,
    brightness: 0.1,
    specular: 1,
    sheenAngle: 45,
    sheenDark: false,
    sheen: 0.3,
    sheenWidth: 3,
    sheenFalloff: 1.5,
    glow: 0.12,
    glowSpread: 1,
    glowFalloff: 0.5
};
export const BLANK_MAP = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
export const DISPERSION_SPREAD = 0.22;
const ERF_K = Math.sqrt(Math.PI);
export const erf = (x)=>Math.tanh(ERF_K * x);
const domeGradientMean = (radius, halfExtent)=>halfExtent > 0 ? (radius - Math.sqrt(radius * radius - halfExtent * halfExtent)) / halfExtent : 0;
export const computeDomeConstants = (capDepth, halfW, halfH)=>{
    const cap = Math.max(0.01, Math.min(capDepth, Math.min(halfW, halfH) - 1));
    const Rx = (halfW * halfW + cap * cap) / (2 * cap);
    const Ry = (halfH * halfH + cap * cap) / (2 * cap);
    const meanX = domeGradientMean(Rx, halfW);
    const meanY = domeGradientMean(Ry, halfH);
    return {
        Rx,
        Ry,
        scaleX: meanX > 0 ? 0.5 / meanX : 1,
        scaleY: meanY > 0 ? 0.5 / meanY : 1
    };
};
export const domeGradient = (distance, radius, scale)=>{
    const inside = Math.min(distance, radius * (1 - 1e-3));
    return inside / Math.sqrt(radius * radius - inside * inside) * scale;
};
export const matrixForAxisScale = (x, y)=>`${x} 0 0 0 ${0.5 * (1 - x)}  0 ${y} 0 0 ${0.5 * (1 - y)}  0 0 1 0 0  0 0 0 1 0`;
const maskCache = new Map();
export const roundedRectMaskUri = (w, h, radius)=>{
    const boxW = Math.max(1, Math.round(w));
    const boxH = Math.max(1, Math.round(h));
    const rad = Math.max(0, Math.min(Math.round(radius), Math.min(boxW, boxH) / 2));
    const key = `rr·${boxW}·${boxH}·${rad}`;
    const cached = maskCache.get(key);
    if (cached) return {
        uri: cached,
        key
    };
    const inset = 0.5;
    const fillW = Math.max(0, boxW - 2 * inset);
    const fillH = Math.max(0, boxH - 2 * inset);
    const corner = Math.max(0, rad - inset);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 ${boxW} ${boxH}'>` + `<rect fill='black' rx='${corner}' ry='${corner}' x='${inset}' y='${inset}' width='${fillW}' height='${fillH}'/></svg>`;
    const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    maskCache.set(key, uri);
    return {
        uri,
        key
    };
};
export const lensShapeMaskUri = (w, h, radius)=>{
    const iw = Math.max(1, Math.round(w));
    const ih = Math.max(1, Math.round(h));
    const r = Math.max(0, Math.min(Math.round(radius), Math.floor(Math.min(iw, ih) / 2)));
    return roundedRectMaskUri(iw, ih, r);
};
const encodeAxis = (signed)=>(0.5 + signed) * 255 + 0.5 | 0;
const encodeSpec = (spec)=>127 * spec + 128 + 0.5 | 0;
export const createLensMapGenerator = (size)=>{
    let canvas = null;
    let ctx = null;
    let image = null;
    let domeLut = null;
    let lutDome = -Infinity;
    let lutHalfW = -Infinity;
    let lutHalfH = -Infinity;
    let lutLen = 0;
    let lutDirty = true;
    let dome = null;
    return {
        generate (shape) {
            if (!canvas) {
                canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                ctx = canvas.getContext("2d");
                image = ctx.createImageData(size, size);
            }
            const { lensHalfWidth: halfW, lensHalfHeight: halfH, borderRadius, depth, clipToShape, softEdge, sheenAngle = 45, glow = 0, glowSpread = 1, glowFalloff = 1.5, sheen = 0, sheenWidth = 3, sheenFalloff = 1.5, curvature = 0, splay = 0, bend = 0, bendWidth = 0.16 } = shape;
            const data = image.data;
            const half = size >> 1;
            const radius = Math.min(borderRadius, Math.min(halfW, halfH));
            const minHalf = Math.min(halfW, halfH);
            const depthPx = Math.min(depth * minHalf, minHalf - 1);
            const innerHalfW = Math.max(0, halfW - depthPx);
            const innerHalfH = Math.max(0, halfH - depthPx);
            const innerRadius = Math.max(0, Math.min(borderRadius, Math.min(innerHalfW, innerHalfH)));
            const falloff = depthPx > 0 ? Math.SQRT1_2 / depthPx : 1e6;
            const hasSpecular = glow > 0 || sheen > 0;
            const angle = sheenAngle * Math.PI / 180;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const edgeInv = sheenWidth > 0 ? 1 / sheenWidth : 0;
            const glowReachInv = 1 / Math.max(2, glowSpread * Math.min(halfW, halfH));
            const stepX = 2 * halfW / size;
            const stepY = 2 * halfH / size;
            const invW = 1 / halfW;
            const invH = 1 / halfH;
            const hasDome = curvature > 0;
            const domeCap = curvature * Math.min(halfW, halfH);
            const hasSplay = splay > 0;
            const hasEdgeRefract = bend > 0;
            const erInv = 1 / Math.max(2, bendWidth * Math.min(halfW, halfH));
            const cornerDistance = (ox, oy)=>ox > 0 || oy > 0 ? Math.sqrt(ox * ox + oy * oy) : 0;
            if (hasDome) {
                if (!dome || Math.abs(domeCap - lutDome) > 0.5 || Math.abs(halfW - lutHalfW) > 1 || Math.abs(halfH - lutHalfH) > 1) {
                    dome = computeDomeConstants(domeCap, halfW, halfH);
                    lutDome = domeCap;
                    lutHalfW = halfW;
                    lutHalfH = halfH;
                    lutDirty = true;
                }
                if (lutLen !== half) {
                    domeLut = new Float32Array(half);
                    lutLen = half;
                    lutDirty = true;
                }
                if (lutDirty) {
                    const lut = domeLut;
                    const d = dome;
                    const r2 = d.Rx * d.Rx;
                    const rMax = d.Rx * (1 - 1e-3);
                    for(let col = 0; col < half; col += 1){
                        const px = -((col + 0.5) * stepX - halfW);
                        const clamped = px < rMax ? px : rMax;
                        lut[col] = clamped / Math.sqrt(r2 - clamped * clamped) * d.scaleX;
                    }
                    lutDirty = false;
                }
            }
            const lut = hasDome ? domeLut : null;
            const splayHalf = 0.5 * Math.min(halfW, halfH);
            const splayInv = splayHalf > 0 ? 1 / splayHalf : 0;
            const sheenNorm = Math.SQRT1_2;
            for(let row = 0; row < half; row += 1){
                const mirrorRow = size - 1 - row;
                const py = -((row + 0.5) * stepY - halfH);
                const edgeY = py - halfH + radius;
                const innerEdgeY = softEdge ? py - innerHalfH + innerRadius : 0;
                const dirYBase = hasDome && lut ? domeGradient(py, dome.Ry, dome.scaleY) : py * invH > 1 ? 1 : py * invH;
                const normY = py * invH > 1 ? 1 : py * invH;
                const splayY = hasSplay ? Math.max(0, 1 - (halfH - py) * splayInv) : 0;
                const rowBase = row * size;
                const mirrorRowBase = mirrorRow * size;
                for(let col = 0; col < half; col += 1){
                    const mirrorCol = size - 1 - col;
                    const px = -((col + 0.5) * stepX - halfW);
                    const edgeX = px - halfW + radius;
                    const sdf = cornerDistance(edgeX > 0 ? edgeX : 0, edgeY > 0 ? edgeY : 0) + (edgeX > edgeY ? edgeX > 0 ? 0 : edgeX : edgeY > 0 ? 0 : edgeY) - radius;
                    const i00 = (rowBase + col) * 4;
                    const i01 = (rowBase + mirrorCol) * 4;
                    const i10 = (mirrorRowBase + col) * 4;
                    const i11 = (mirrorRowBase + mirrorCol) * 4;
                    if (clipToShape && sdf >= 0) {
                        for (const idx of [
                            i00,
                            i01,
                            i10,
                            i11
                        ]){
                            data[idx] = 128;
                            data[idx + 1] = 128;
                            data[idx + 2] = 128;
                            data[idx + 3] = 255;
                        }
                        continue;
                    }
                    let dirX = lut ? lut[col] : px * invW > 1 ? 1 : px * invW;
                    let dirY = dirYBase;
                    if (hasSplay) {
                        const yAtt = splayY * splay;
                        const xAtt = Math.max(0, 1 - (halfW - px) * splayInv) * splay;
                        if (yAtt > 0.001 || xAtt > 0.001) {
                            const prevX = dirX;
                            const prevY = dirY;
                            dirX = prevX * (1 - yAtt);
                            dirY = prevY * (1 - xAtt);
                            const prevLen = Math.sqrt(prevX * prevX + prevY * prevY);
                            const nextLen = Math.sqrt(dirX * dirX + dirY * dirY);
                            if (nextLen > 0.001) {
                                const restore = prevLen / nextLen;
                                dirX *= restore;
                                dirY *= restore;
                            }
                        }
                    }
                    let edgeOpacity = 1;
                    if (softEdge) {
                        const ix = px - innerHalfW + innerRadius;
                        const innerSdf = cornerDistance(ix > 0 ? ix : 0, innerEdgeY > 0 ? innerEdgeY : 0) + (ix > innerEdgeY ? ix > 0 ? 0 : ix : innerEdgeY > 0 ? 0 : innerEdgeY) - innerRadius;
                        edgeOpacity = 0.5 * (1 + erf(innerSdf * falloff));
                    }
                    let dx = 0.5 * dirX * edgeOpacity;
                    let dy = 0.5 * dirY * edgeOpacity;
                    if (hasEdgeRefract) {
                        const s = sdf < 0 ? Math.max(0, 1 + sdf * erInv) : 0;
                        if (s > 0) {
                            const len = Math.sqrt(dirX * dirX + dirY * dirY);
                            if (len > 1e-4) {
                                const m = 6.75 * s * s * (1 - s);
                                const a = 0.5 * bend * m * edgeOpacity / len;
                                dx += dirX * a;
                                dy += dirY * a;
                            }
                        }
                    }
                    let specMain = 0;
                    let specCross = 0;
                    if (hasSpecular) {
                        const normX = px * invW > 1 ? 1 : px * invW;
                        const axisMain = Math.min(1, Math.abs(normX * cosA + normY * sinA) * sheenNorm);
                        const axisCross = Math.min(1, Math.abs(normX * cosA - normY * sinA) * sheenNorm);
                        if (sheen > 0) {
                            const band = sdf < 0 ? Math.max(0, 1 + sdf * edgeInv) : 0;
                            const b = sheen * Math.pow(band, sheenFalloff);
                            specMain += b * (0.16 + 0.84 * Math.pow(axisMain, 1.6));
                            specCross += b * (0.16 + 0.84 * Math.pow(axisCross, 1.6));
                        }
                        if (glow > 0) {
                            const reach = sdf < 0 ? Math.min(1, -sdf * glowReachInv) : 1;
                            const t = 1 - reach;
                            const g = glow * Math.pow(t * t * (3 - 2 * t), glowFalloff) * edgeOpacity;
                            specMain += g * (0.6 + 0.4 * axisMain);
                            specCross += g * (0.6 + 0.4 * axisCross);
                        }
                        if (specMain > 1) specMain = 1;
                        else if (specMain < -1) specMain = -1;
                        if (specCross > 1) specCross = 1;
                        else if (specCross < -1) specCross = -1;
                    }
                    const rPos = encodeAxis(dx);
                    const rNeg = encodeAxis(-dx);
                    const gPos = encodeAxis(dy);
                    const gNeg = encodeAxis(-dy);
                    const bMain = encodeSpec(specMain);
                    const bCross = encodeSpec(specCross);
                    data[i00] = rPos;
                    data[i00 + 1] = gPos;
                    data[i00 + 2] = bMain;
                    data[i00 + 3] = 255;
                    data[i01] = rNeg;
                    data[i01 + 1] = gPos;
                    data[i01 + 2] = bCross;
                    data[i01 + 3] = 255;
                    data[i10] = rPos;
                    data[i10 + 1] = gNeg;
                    data[i10 + 2] = bCross;
                    data[i10 + 3] = 255;
                    data[i11] = rNeg;
                    data[i11 + 1] = gNeg;
                    data[i11 + 2] = bMain;
                    data[i11 + 3] = 255;
                }
            }
            ctx.putImageData(image, 0, 0);
            return canvas.toDataURL();
        },
        dispose () {
            if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
                canvas = null;
            }
            ctx = null;
            image = null;
            domeLut = null;
            dome = null;
            lutDome = -Infinity;
            lutHalfW = -Infinity;
            lutHalfH = -Infinity;
            lutLen = 0;
            lutDirty = true;
        }
    };
};
