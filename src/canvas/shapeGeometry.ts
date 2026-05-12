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
 * A primitive piece used in compound shapes. Each piece is rendered with
 * the shared shape style (fill + stroke + strokeWidth), except for the
 * cosmetic strokes inside compound shapes (e.g. divider lines inside a
 * `predefinedProcess`) which use stroke-only via `fillOverride: 'none'`.
 */
export type ShapePiece =
	| { type: 'rect'; x: number; y: number; w: number; h: number; rx?: number; fillOverride?: 'none' }
	| { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fillOverride?: 'none' }
	| { type: 'polygon'; points: string; fillOverride?: 'none' }
	| { type: 'path'; d: string; fillOverride?: 'none' }
	| { type: 'line'; x1: number; y1: number; x2: number; y2: number }
	| { type: 'circle'; cx: number; cy: number; r: number; fillOverride?: 'none' };

/**
 * Describes how to render a given ShapeKind. The renderer (TS or JS)
 * consumes this and emits the appropriate SVG nodes. Pure data so the
 * description is identical in both runtimes.
 *
 * `compound` is used for shapes built from several primitives (server,
 * actor, queue, predefinedProcess) where a single path would be much
 * harder to read than a list of pieces.
 */
export type ShapeDraw =
	| { kind: 'polygon'; points: string }
	| { kind: 'path'; d: string }
	| { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number }
	| { kind: 'cylinder'; body: string; top: { cx: number; cy: number; rx: number; ry: number } }
	| { kind: 'compound'; pieces: ShapePiece[] };

/** Rounded rectangle - fixed corner radius capped to fit the smaller side. */
export function roundedRectangleRx(b: Box): number {
	return Math.min(12, b.w / 5, b.h / 5);
}

/** Terminator / pill - corner radius equals half of the smaller side. */
export function terminatorRx(b: Box): number {
	return Math.min(b.w, b.h) / 2;
}

/**
 * Manual input - rectangle with the top edge slanted upward to the right.
 * Used in flow charts for keyboard / interactive input.
 */
export function manualInputPoints(b: Box): string {
	const slant = Math.min(b.h * 0.3, b.w * 0.2);
	return pts([
		[b.x, b.y + slant],
		[b.x + b.w, b.y],
		[b.x + b.w, b.y + b.h],
		[b.x, b.y + b.h],
	]);
}

/**
 * Star: 5-point star inscribed into the bounding box. Outer radius fits
 * the box, inner radius is ~0.4 of the outer for the classic look.
 */
export function starPoints(b: Box): string {
	const cx = b.x + b.w / 2;
	const cy = b.y + b.h / 2;
	const rOuter = Math.min(b.w, b.h) / 2;
	const rInner = rOuter * 0.4;
	const coords: number[][] = [];
	for (let i = 0; i < 10; i++) {
		const angle = -Math.PI / 2 + i * Math.PI / 5;
		const r = i % 2 === 0 ? rOuter : rInner;
		coords.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
	}
	return pts(coords);
}

/**
 * Predefined process: rectangle with two vertical bars near the left and
 * right edges. Classic flowchart subroutine glyph.
 */
export function predefinedProcessPieces(b: Box): ShapePiece[] {
	const inset = Math.min(b.w * 0.12, 14);
	return [
		{ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h },
		{ type: 'line', x1: b.x + inset, y1: b.y, x2: b.x + inset, y2: b.y + b.h },
		{ type: 'line', x1: b.x + b.w - inset, y1: b.y, x2: b.x + b.w - inset, y2: b.y + b.h },
	];
}

/**
 * Server / rack: rectangle subdivided by two horizontal dividers + small
 * status dot in the top-left band. Reads unmistakably as a 1U/2U server.
 */
export function serverPieces(b: Box): ShapePiece[] {
	const bandH = Math.max(8, b.h / 4);
	const dotR = Math.max(2, bandH * 0.18);
	return [
		{ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: 2 },
		{ type: 'line', x1: b.x, y1: b.y + bandH, x2: b.x + b.w, y2: b.y + bandH },
		{ type: 'line', x1: b.x, y1: b.y + bandH * 2, x2: b.x + b.w, y2: b.y + bandH * 2 },
		{ type: 'circle', cx: b.x + bandH * 0.5, cy: b.y + bandH * 0.5, r: dotR, fillOverride: 'none' },
		{ type: 'circle', cx: b.x + bandH * 0.5, cy: b.y + bandH * 1.5, r: dotR, fillOverride: 'none' },
	];
}

/**
 * Actor: classic stick figure - head + body + arms + two legs. Sized to
 * fit the box; the figure is centered horizontally.
 */
export function actorPieces(b: Box): ShapePiece[] {
	const cx = b.x + b.w / 2;
	const headR = Math.min(b.w * 0.18, b.h * 0.12);
	const headCy = b.y + headR;
	const neckY = headCy + headR;
	const hipY = b.y + b.h * 0.65;
	const armY = neckY + (hipY - neckY) * 0.35;
	const feetY = b.y + b.h;
	const legSpread = b.w * 0.25;
	const armSpread = b.w * 0.32;
	return [
		{ type: 'circle', cx: cx, cy: headCy, r: headR },
		{ type: 'line', x1: cx, y1: neckY, x2: cx, y2: hipY },
		{ type: 'line', x1: cx - armSpread, y1: armY, x2: cx + armSpread, y2: armY },
		{ type: 'line', x1: cx, y1: hipY, x2: cx - legSpread, y2: feetY },
		{ type: 'line', x1: cx, y1: hipY, x2: cx + legSpread, y2: feetY },
	];
}

/**
 * Queue: horizontal cylinder. Conceptually rotated cylinder; rendered as
 * a rounded rectangle body + a left-side ellipse cap rim to suggest depth.
 */
export function queuePieces(b: Box): ShapePiece[] {
	const rx = Math.min(b.w * 0.15, b.h * 0.5);
	const ry = b.h / 2;
	return [
		// body: rectangle stretched across, closed on the right end.
		{ type: 'path', d:
			`M ${num(b.x + rx)} ${num(b.y)}` +
			` L ${num(b.x + b.w)} ${num(b.y)}` +
			` L ${num(b.x + b.w)} ${num(b.y + b.h)}` +
			` L ${num(b.x + rx)} ${num(b.y + b.h)}` +
			` A ${num(rx)} ${num(ry)} 0 0 1 ${num(b.x + rx)} ${num(b.y)}` +
			` Z`,
		},
		// left cap rim (visible front face of the cylinder)
		{ type: 'ellipse', cx: b.x + rx, cy: b.y + ry, rx: rx, ry: ry, fillOverride: 'none' },
	];
}

/** Maps a ShapeKind + box to the drawing primitive(s) used for rendering. */
export function shapeDraw(kind: ShapeKind, b: Box): ShapeDraw {
	switch (kind) {
		case 'diamond':           return { kind: 'polygon', points: diamondPoints(b) };
		case 'parallelogram':     return { kind: 'polygon', points: parallelogramPoints(b) };
		case 'hexagon':           return { kind: 'polygon', points: hexagonPoints(b) };
		case 'triangle':          return { kind: 'polygon', points: trianglePoints(b) };
		case 'card':              return { kind: 'polygon', points: cardPoints(b) };
		case 'cloud':             return { kind: 'path', d: cloudPath(b) };
		case 'callout':           return { kind: 'path', d: calloutPath(b) };
		case 'document':          return { kind: 'path', d: documentPath(b) };
		case 'cylinder':          return { kind: 'cylinder', body: cylinderBodyPath(b), top: cylinderTopEllipse(b) };
		case 'roundedRectangle':  return { kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: roundedRectangleRx(b) };
		case 'terminator':        return { kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: terminatorRx(b) };
		case 'manualInput':       return { kind: 'polygon', points: manualInputPoints(b) };
		case 'star':              return { kind: 'polygon', points: starPoints(b) };
		case 'predefinedProcess': return { kind: 'compound', pieces: predefinedProcessPieces(b) };
		case 'server':            return { kind: 'compound', pieces: serverPieces(b) };
		case 'actor':             return { kind: 'compound', pieces: actorPieces(b) };
		case 'queue':             return { kind: 'compound', pieces: queuePieces(b) };
	}
}
