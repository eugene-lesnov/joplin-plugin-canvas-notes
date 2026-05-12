/**
 * Pure path/polygon math for the unified `ShapeElement` model.
 *
 * Every helper takes a box {x, y, w, h} and returns either:
 *   - a `points` string suitable for `<polygon points="..."/>`, or
 *   - a `d` string suitable for `<path d="..."/>`.
 *
 * Used by both the SVG serializer (TS) and the in-app DOM renderer. The
 * webview side has a JS mirror that keeps the same math.
 */

import { ShapeKind } from './canvasTypes';
import { formatNumber as num } from './xmlEscape';

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Joins (x, y) pairs into the `points` attribute format. */
function pts(coords: number[][]): string {
	return coords.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
}

/** Diamond/rhombus inscribed into the bounding box. */
export function diamondPoints(b: Box): string {
	const cx = b.x + b.w / 2;
	const cy = b.y + b.h / 2;
	return pts([
		[cx, b.y],
		[b.x + b.w, cy],
		[cx, b.y + b.h],
		[b.x, cy],
	]);
}

/** Right-leaning parallelogram (slants top-right, like UML data). */
export function parallelogramPoints(b: Box): string {
	const skew = Math.min(b.w * 0.25, b.h * 0.6);
	return pts([
		[b.x + skew, b.y],
		[b.x + b.w, b.y],
		[b.x + b.w - skew, b.y + b.h],
		[b.x, b.y + b.h],
	]);
}

/** Regular-ish hexagon inscribed into the box (point-left / point-right). */
export function hexagonPoints(b: Box): string {
	const inset = Math.min(b.w * 0.25, b.h * 0.5);
	const top = b.y;
	const bottom = b.y + b.h;
	const mid = b.y + b.h / 2;
	return pts([
		[b.x + inset, top],
		[b.x + b.w - inset, top],
		[b.x + b.w, mid],
		[b.x + b.w - inset, bottom],
		[b.x + inset, bottom],
		[b.x, mid],
	]);
}

/** Upward-pointing isoceles triangle. */
export function trianglePoints(b: Box): string {
	return pts([
		[b.x + b.w / 2, b.y],
		[b.x + b.w, b.y + b.h],
		[b.x, b.y + b.h],
	]);
}

/**
 * Cylinder rendered as a closed path: side walls + a bottom arc + a top
 * ellipse drawn as part of the path so the whole shape is one element.
 * The top ellipse is rendered as a separate `<ellipse>` overlay by the
 * caller for a clean stroke break - this function only returns the body.
 */
export function cylinderBodyPath(b: Box): string {
	const rx = b.w / 2;
	const ry = Math.min(b.h * 0.15, b.w * 0.25);
	const cx = b.x + rx;
	const top = b.y + ry;
	const bottom = b.y + b.h - ry;
	// Body outline: M(left, top) V(left, bottom) A(rx,ry to right,bottom) V(right, top) A(rx,ry to left,top) Z
	return (
		`M ${num(b.x)} ${num(top)}` +
		` L ${num(b.x)} ${num(bottom)}` +
		` A ${num(rx)} ${num(ry)} 0 0 0 ${num(b.x + b.w)} ${num(bottom)}` +
		` L ${num(b.x + b.w)} ${num(top)}` +
		` A ${num(rx)} ${num(ry)} 0 0 0 ${num(b.x)} ${num(top)}` +
		` Z`
	);
}

/** Top ellipse of a cylinder - separate node so the visible rim line shows. */
export function cylinderTopEllipse(b: Box): { cx: number; cy: number; rx: number; ry: number } {
	const rx = b.w / 2;
	const ry = Math.min(b.h * 0.15, b.w * 0.25);
	return { cx: b.x + rx, cy: b.y + ry, rx, ry };
}

/**
 * Cloud silhouette built from cubic Bezier bumps along the top and
 * bottom edge. Simple, readable, looks unmistakably "cloudy".
 */
export function cloudPath(b: Box): string {
	const x = b.x, y = b.y, w = b.w, h = b.h;
	// All control points are derived from box ratios so the cloud scales
	// without distortion. The path goes left -> top -> right -> bottom -> close.
	const dx = w / 6;
	const dy = h / 4;
	return (
		`M ${num(x + dx)} ${num(y + h * 0.7)}` +
		` C ${num(x)} ${num(y + h * 0.7)}, ${num(x)} ${num(y + h * 0.3)}, ${num(x + dx)} ${num(y + h * 0.3)}` +
		` C ${num(x + dx)} ${num(y)}, ${num(x + w * 0.5)} ${num(y)}, ${num(x + w * 0.5)} ${num(y + dy)}` +
		` C ${num(x + w * 0.55)} ${num(y)}, ${num(x + w - dx)} ${num(y)}, ${num(x + w - dx)} ${num(y + h * 0.3)}` +
		` C ${num(x + w)} ${num(y + h * 0.3)}, ${num(x + w)} ${num(y + h * 0.7)}, ${num(x + w - dx)} ${num(y + h * 0.7)}` +
		` C ${num(x + w)} ${num(y + h)}, ${num(x + w * 0.55)} ${num(y + h)}, ${num(x + w * 0.5)} ${num(y + h - dy)}` +
		` C ${num(x + w * 0.5)} ${num(y + h)}, ${num(x + dx)} ${num(y + h)}, ${num(x + dx)} ${num(y + h * 0.7)}` +
		` Z`
	);
}

/**
 * Card: rectangle with the top-right corner folded inward (classic
 * "note card" silhouette). Folded corner is sized to a fraction of the
 * smaller side so it stays proportional.
 */
export function cardPoints(b: Box): string {
	const fold = Math.min(b.w, b.h) * 0.18;
	return pts([
		[b.x, b.y],
		[b.x + b.w - fold, b.y],
		[b.x + b.w, b.y + fold],
		[b.x + b.w, b.y + b.h],
		[b.x, b.y + b.h],
	]);
}

/**
 * Callout: rounded rectangle body with a small triangular pointer in the
 * bottom-left. The returned `path` is the complete outline so a single
 * fill/stroke is enough.
 */
export function calloutPath(b: Box): string {
	const r = Math.min(8, b.w / 8, b.h / 8);
	const pointerH = Math.min(12, b.h * 0.2);
	const pointerW = Math.min(14, b.w * 0.18);
	const bodyBottom = b.y + b.h - pointerH;
	const px = b.x + b.w * 0.18;

	return (
		`M ${num(b.x + r)} ${num(b.y)}` +
		` L ${num(b.x + b.w - r)} ${num(b.y)}` +
		` Q ${num(b.x + b.w)} ${num(b.y)}, ${num(b.x + b.w)} ${num(b.y + r)}` +
		` L ${num(b.x + b.w)} ${num(bodyBottom - r)}` +
		` Q ${num(b.x + b.w)} ${num(bodyBottom)}, ${num(b.x + b.w - r)} ${num(bodyBottom)}` +
		` L ${num(px + pointerW)} ${num(bodyBottom)}` +
		` L ${num(px)} ${num(b.y + b.h)}` +
		` L ${num(px + pointerW * 0.5)} ${num(bodyBottom)}` +
		` L ${num(b.x + r)} ${num(bodyBottom)}` +
		` Q ${num(b.x)} ${num(bodyBottom)}, ${num(b.x)} ${num(bodyBottom - r)}` +
		` L ${num(b.x)} ${num(b.y + r)}` +
		` Q ${num(b.x)} ${num(b.y)}, ${num(b.x + r)} ${num(b.y)}` +
		` Z`
	);
}

/**
 * Document: rectangle with a wavy bottom edge. The wave is two opposite
 * cubic curves that match at the midpoint, giving the classic "paper"
 * silhouette used in flow charts.
 */
export function documentPath(b: Box): string {
	const x = b.x, y = b.y, w = b.w, h = b.h;
	const waveAmp = Math.min(h * 0.15, 16);
	const midX = x + w / 2;
	const baseY = y + h - waveAmp / 2;
	return (
		`M ${num(x)} ${num(y)}` +
		` L ${num(x + w)} ${num(y)}` +
		` L ${num(x + w)} ${num(baseY)}` +
		` C ${num(x + w * 0.75)} ${num(baseY + waveAmp)}, ${num(midX)} ${num(baseY - waveAmp)}, ${num(midX)} ${num(baseY)}` +
		` C ${num(x + w * 0.25)} ${num(baseY + waveAmp)}, ${num(x)} ${num(baseY - waveAmp)}, ${num(x)} ${num(baseY)}` +
		` Z`
	);
}

/**
 * Describes how to render a given ShapeKind. The renderer (TS or JS)
 * consumes this and emits the appropriate SVG nodes. Pure data so the
 * description is identical in both runtimes.
 */
export type ShapeDraw =
	| { kind: 'polygon'; points: string }
	| { kind: 'path'; d: string }
	| { kind: 'cylinder'; body: string; top: { cx: number; cy: number; rx: number; ry: number } };

/** Maps a ShapeKind + box to the drawing primitive(s) used for rendering. */
export function shapeDraw(kind: ShapeKind, b: Box): ShapeDraw {
	switch (kind) {
		case 'diamond':       return { kind: 'polygon', points: diamondPoints(b) };
		case 'parallelogram': return { kind: 'polygon', points: parallelogramPoints(b) };
		case 'hexagon':       return { kind: 'polygon', points: hexagonPoints(b) };
		case 'triangle':      return { kind: 'polygon', points: trianglePoints(b) };
		case 'card':          return { kind: 'polygon', points: cardPoints(b) };
		case 'cloud':         return { kind: 'path', d: cloudPath(b) };
		case 'callout':       return { kind: 'path', d: calloutPath(b) };
		case 'document':      return { kind: 'path', d: documentPath(b) };
		case 'cylinder':      return { kind: 'cylinder', body: cylinderBodyPath(b), top: cylinderTopEllipse(b) };
	}
}
