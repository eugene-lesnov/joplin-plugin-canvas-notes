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
/**
 * Optional style overrides applicable to any piece:
 *   - fillOverride === 'none'     : stroke-only piece (no fill);
 *   - strokeWidthMul              : stroke width = base * this multiplier
 *                                   (used for BPMN end events that need
 *                                   a thicker outline);
 *   - noStroke                    : piece is filled but has no outline
 *                                   (used for solid dots / fills inside
 *                                   compound shapes).
 */
interface PieceStyle {
	fillOverride?: 'none';
	strokeWidthMul?: number;
	noStroke?: boolean;
}

export type ShapePiece =
	| ({ type: 'rect'; x: number; y: number; w: number; h: number; rx?: number } & PieceStyle)
	| ({ type: 'ellipse'; cx: number; cy: number; rx: number; ry: number } & PieceStyle)
	| ({ type: 'polygon'; points: string } & PieceStyle)
	| ({ type: 'path'; d: string } & PieceStyle)
	| ({ type: 'line'; x1: number; y1: number; x2: number; y2: number } & PieceStyle)
	| ({ type: 'circle'; cx: number; cy: number; r: number } & PieceStyle);

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
 * Predefined process (a.k.a. subroutine): single path that combines the
 * outer rectangle with two internal vertical bars. Using one path avoids
 * the visual noise of three separate stroked elements piled on top of
 * each other at small sizes.
 */
export function predefinedProcessPath(b: Box): string {
	const inset = Math.min(b.w * 0.12, 14);
	return (
		// Outer rectangle.
		`M ${num(b.x)} ${num(b.y)}` +
		` L ${num(b.x + b.w)} ${num(b.y)}` +
		` L ${num(b.x + b.w)} ${num(b.y + b.h)}` +
		` L ${num(b.x)} ${num(b.y + b.h)} Z` +
		// Left inner bar (move + line, no fill contribution because the
		// segments lie inside the outer rect).
		` M ${num(b.x + inset)} ${num(b.y)}` +
		` L ${num(b.x + inset)} ${num(b.y + b.h)}` +
		// Right inner bar.
		` M ${num(b.x + b.w - inset)} ${num(b.y)}` +
		` L ${num(b.x + b.w - inset)} ${num(b.y + b.h)}`
	);
}

/**
 * Server / rack: rectangle subdivided by two horizontal dividers. The
 * earlier version added stroke-only status dots; at small sizes those
 * read as random specks on top of the horizontal lines, so the dots are
 * removed in favor of a clean 3-band layout.
 */
export function serverPieces(b: Box): ShapePiece[] {
	const bandH = Math.max(8, b.h / 3);
	return [
		{ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: 2 },
		{ type: 'line', x1: b.x, y1: b.y + bandH, x2: b.x + b.w, y2: b.y + bandH },
		{ type: 'line', x1: b.x, y1: b.y + bandH * 2, x2: b.x + b.w, y2: b.y + bandH * 2 },
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

// ---- additional basic shapes ---------------------------------------------

/** Regular pentagon inscribed into the bounding box, point at the top. */
export function pentagonPoints(b: Box): string {
	const cx = b.x + b.w / 2;
	const cy = b.y + b.h / 2;
	const rx = b.w / 2;
	const ry = b.h / 2;
	const coords: number[][] = [];
	for (let i = 0; i < 5; i++) {
		const angle = -Math.PI / 2 + i * 2 * Math.PI / 5;
		coords.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
	}
	return pts(coords);
}

/** Trapezoid (isoceles) with the longer side at the bottom. */
export function trapezoidPoints(b: Box): string {
	const inset = Math.min(b.w * 0.2, b.h * 0.5);
	return pts([
		[b.x + inset, b.y],
		[b.x + b.w - inset, b.y],
		[b.x + b.w, b.y + b.h],
		[b.x, b.y + b.h],
	]);
}

// ---- additional flowchart shapes ----------------------------------------

/** Delay: rectangle with the right edge rounded into a semicircle. */
export function delayPath(b: Box): string {
	const r = b.h / 2;
	return (
		`M ${num(b.x)} ${num(b.y)}` +
		` L ${num(b.x + b.w - r)} ${num(b.y)}` +
		` A ${num(r)} ${num(r)} 0 0 1 ${num(b.x + b.w - r)} ${num(b.y + b.h)}` +
		` L ${num(b.x)} ${num(b.y + b.h)}` +
		` Z`
	);
}

/**
 * Off-page connector: "home plate" shape - rectangle with the bottom edge
 * folded to a point. Standard flow chart symbol for branching to another
 * page or another diagram.
 */
export function offPageConnectorPoints(b: Box): string {
	const foldStartY = b.y + b.h * 0.6;
	return pts([
		[b.x, b.y],
		[b.x + b.w, b.y],
		[b.x + b.w, foldStartY],
		[b.x + b.w / 2, b.y + b.h],
		[b.x, foldStartY],
	]);
}

/**
 * Multiple documents: a single rear sheet peeking out from behind the
 * main document. Only two layers - earlier three-layer version produced
 * too many parallel strokes that read as visual noise at small sizes.
 */
export function multipleDocumentsPieces(b: Box): ShapePiece[] {
	const offset = Math.min(b.w * 0.1, b.h * 0.1, 10);
	return [
		// Rear sheet: stroke-only thin rect so it does not compete with
		// the front document outline.
		{ type: 'rect',
			x: b.x + offset, y: b.y,
			w: b.w - offset, h: b.h - offset,
			fillOverride: 'none' },
		// Front document with the wavy bottom.
		{ type: 'path', d: documentPath({ x: b.x, y: b.y + offset, w: b.w - offset, h: b.h - offset }) },
	];
}

// ---- additional IT / infrastructure shapes ------------------------------

/** Folder: rectangle with a small tab on top-left, like an OS folder. */
export function folderPieces(b: Box): ShapePiece[] {
	const tabW = Math.min(b.w * 0.35, 60);
	const tabH = Math.min(b.h * 0.2, 14);
	const tabSlant = Math.min(tabH * 0.5, 6);
	return [
		// Tab on top-left.
		{ type: 'polygon', points: pts([
			[b.x, b.y],
			[b.x + tabW, b.y],
			[b.x + tabW + tabSlant, b.y + tabH],
			[b.x, b.y + tabH],
		]) },
		// Body rect starts right under the tab.
		{ type: 'rect', x: b.x, y: b.y + tabH, w: b.w, h: b.h - tabH, rx: 2 },
	];
}

/** Browser window: title bar + 3 traffic-light dots + body area. */
export function browserPieces(b: Box): ShapePiece[] {
	const barH = Math.min(b.h * 0.18, 18);
	const dotR = Math.max(1.5, barH * 0.22);
	const dotY = b.y + barH / 2;
	const dotX = b.x + barH * 0.55;
	const dotGap = barH * 0.55;
	return [
		{ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: 2 },
		{ type: 'line', x1: b.x, y1: b.y + barH, x2: b.x + b.w, y2: b.y + barH },
		{ type: 'circle', cx: dotX, cy: dotY, r: dotR, fillOverride: 'none' },
		{ type: 'circle', cx: dotX + dotGap, cy: dotY, r: dotR, fillOverride: 'none' },
		{ type: 'circle', cx: dotX + dotGap * 2, cy: dotY, r: dotR, fillOverride: 'none' },
	];
}

/** Desktop computer: monitor + base / stand. */
export function desktopPieces(b: Box): ShapePiece[] {
	const screenH = b.h * 0.7;
	const standW = b.w * 0.18;
	const standH = b.h * 0.12;
	const baseW = b.w * 0.4;
	const baseY = b.y + screenH + standH;
	return [
		{ type: 'rect', x: b.x, y: b.y, w: b.w, h: screenH, rx: 2 },
		{ type: 'rect',
			x: b.x + (b.w - standW) / 2, y: b.y + screenH,
			w: standW, h: standH },
		{ type: 'rect',
			x: b.x + (b.w - baseW) / 2, y: baseY,
			w: baseW, h: b.h - screenH - standH, rx: 2 },
	];
}

/** Laptop: screen on top + trapezoid base below. */
export function laptopPieces(b: Box): ShapePiece[] {
	const screenH = b.h * 0.78;
	const baseY = b.y + screenH;
	const baseH = b.h - screenH;
	const overhang = b.w * 0.08;
	return [
		{ type: 'rect', x: b.x + overhang * 0.5, y: b.y, w: b.w - overhang, h: screenH, rx: 2 },
		{ type: 'polygon', points: pts([
			[b.x, baseY + baseH],
			[b.x + overhang, baseY],
			[b.x + b.w - overhang, baseY],
			[b.x + b.w, baseY + baseH],
		]) },
	];
}

/** Mobile phone: rounded rectangle with a screen area + home indicator. */
export function mobilePieces(b: Box): ShapePiece[] {
	const rx = Math.min(b.w * 0.15, b.h * 0.05, 8);
	const topPad = b.h * 0.08;
	const bottomPad = b.h * 0.1;
	const sidePad = b.w * 0.08;
	const homeY = b.y + b.h - bottomPad / 2;
	const homeW = b.w * 0.3;
	return [
		{ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: rx },
		// Screen area outline.
		{ type: 'rect',
			x: b.x + sidePad, y: b.y + topPad,
			w: b.w - sidePad * 2, h: b.h - topPad - bottomPad,
			fillOverride: 'none' },
		// Home indicator (rounded short pill).
		{ type: 'rect',
			x: b.x + (b.w - homeW) / 2, y: homeY - 1,
			w: homeW, h: 2, rx: 1, fillOverride: 'none' },
	];
}

/**
 * Container (Docker-style): pseudo-3D box. A front face + top + side
 * parallelograms suggest depth without going full isometric.
 */
export function containerPieces(b: Box): ShapePiece[] {
	const depth = Math.min(b.w * 0.18, b.h * 0.25, 18);
	const frontX = b.x;
	const frontY = b.y + depth;
	const frontW = b.w - depth;
	const frontH = b.h - depth;
	return [
		// Top face.
		{ type: 'polygon', points: pts([
			[frontX, frontY],
			[frontX + depth, b.y],
			[frontX + depth + frontW, b.y],
			[frontX + frontW, frontY],
		]) },
		// Right face.
		{ type: 'polygon', points: pts([
			[frontX + frontW, frontY],
			[frontX + depth + frontW, b.y],
			[frontX + depth + frontW, b.y + frontH],
			[frontX + frontW, frontY + frontH],
		]) },
		// Front face.
		{ type: 'rect', x: frontX, y: frontY, w: frontW, h: frontH },
	];
}

/**
 * Gear: 8-tooth gear glyph. A simple octagonal outer ring with a circle
 * cut-out in the middle. Stylized for readability at small sizes.
 */
export function gearPieces(b: Box): ShapePiece[] {
	const cx = b.x + b.w / 2;
	const cy = b.y + b.h / 2;
	const rOuter = Math.min(b.w, b.h) / 2;
	const rInner = rOuter * 0.7;
	const rHole = rOuter * 0.32;
	const teeth = 8;
	const coords: number[][] = [];
	for (let i = 0; i < teeth * 2; i++) {
		const angle = -Math.PI / 2 + i * Math.PI / teeth;
		const r = i % 2 === 0 ? rOuter : rInner;
		coords.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
	}
	return [
		{ type: 'polygon', points: pts(coords) },
		{ type: 'circle', cx: cx, cy: cy, r: rHole, fillOverride: 'none' },
	];
}

/**
 * Load balancer: circle with arrows branching outward (left -> in,
 * right -> 2 outputs). Distinctive enough to read in an architecture
 * diagram without a label.
 */
export function loadBalancerPieces(b: Box): ShapePiece[] {
	const cx = b.x + b.w / 2;
	const cy = b.y + b.h / 2;
	const r = Math.min(b.w, b.h) * 0.32;
	const armLen = Math.min(b.w, b.h) * 0.25;
	return [
		{ type: 'circle', cx: cx, cy: cy, r: r },
		// Incoming arrow from the left.
		{ type: 'line', x1: cx - r - armLen, y1: cy, x2: cx - r, y2: cy },
		// Two outgoing arrows on the right (up and down).
		{ type: 'line', x1: cx + r, y1: cy - r * 0.5, x2: cx + r + armLen, y2: cy - r - armLen * 0.4 },
		{ type: 'line', x1: cx + r, y1: cy + r * 0.5, x2: cx + r + armLen, y2: cy + r + armLen * 0.4 },
	];
}

/**
 * Firewall: simplified brick wall - 2 horizontal rows with a single
 * staggered vertical join, the body remains readable at small sizes.
 * The previous version had too many short verticals which looked busy.
 */
export function firewallPieces(b: Box): ShapePiece[] {
	const midY = b.y + b.h / 2;
	return [
		{ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h },
		{ type: 'line', x1: b.x, y1: midY, x2: b.x + b.w, y2: midY },
		// Top row: single vertical at 1/2 width.
		{ type: 'line', x1: b.x + b.w / 2, y1: b.y, x2: b.x + b.w / 2, y2: midY },
		// Bottom row: two verticals at 1/4 and 3/4 (staggered bricks).
		{ type: 'line', x1: b.x + b.w / 4, y1: midY, x2: b.x + b.w / 4, y2: b.y + b.h },
		{ type: 'line', x1: b.x + 3 * b.w / 4, y1: midY, x2: b.x + 3 * b.w / 4, y2: b.y + b.h },
	];
}

/** Padlock: round shackle on top + rectangular body. */
export function lockPieces(b: Box): ShapePiece[] {
	const bodyH = b.h * 0.6;
	const bodyY = b.y + b.h - bodyH;
	const shackleR = Math.min(b.w * 0.3, (b.h - bodyH) * 0.95);
	const shackleCx = b.x + b.w / 2;
	const shackleCy = bodyY;
	return [
		// Shackle: half-circle arc.
		{ type: 'path', d:
			`M ${num(shackleCx - shackleR)} ${num(shackleCy)}` +
			` A ${num(shackleR)} ${num(shackleR)} 0 0 1 ${num(shackleCx + shackleR)} ${num(shackleCy)}`,
			fillOverride: 'none' },
		// Body.
		{ type: 'rect', x: b.x, y: bodyY, w: b.w, h: bodyH, rx: 2 },
	];
}

/**
 * Sticky note: rectangle with a folded corner in the bottom-right. The
 * fold is drawn as a small triangle in stroke-only to suggest the curl.
 */
export function stickyNotePieces(b: Box): ShapePiece[] {
	const fold = Math.min(b.w, b.h) * 0.16;
	return [
		// Main body with a clipped corner.
		{ type: 'polygon', points: pts([
			[b.x, b.y],
			[b.x + b.w, b.y],
			[b.x + b.w, b.y + b.h - fold],
			[b.x + b.w - fold, b.y + b.h],
			[b.x, b.y + b.h],
		]) },
		// Folded corner as a small triangle outline.
		{ type: 'polygon', points: pts([
			[b.x + b.w, b.y + b.h - fold],
			[b.x + b.w - fold, b.y + b.h - fold],
			[b.x + b.w - fold, b.y + b.h],
		]), fillOverride: 'none' },
	];
}

/** Maps a ShapeKind + box to the drawing primitive(s) used for rendering. */
export function shapeDraw(kind: ShapeKind, b: Box): ShapeDraw {
	switch (kind) {
		// ---- primitives ----
		case 'rectangle':         return { kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: 0 };
		case 'ellipse':           return { kind: 'compound', pieces: [
			{ type: 'ellipse', cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2 },
		] };
		case 'roundedRectangle':  return { kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: roundedRectangleRx(b) };
		case 'triangle':          return { kind: 'polygon', points: trianglePoints(b) };
		case 'diamond':           return { kind: 'polygon', points: diamondPoints(b) };
		case 'parallelogram':     return { kind: 'polygon', points: parallelogramPoints(b) };
		case 'trapezoid':         return { kind: 'polygon', points: trapezoidPoints(b) };
		case 'hexagon':           return { kind: 'polygon', points: hexagonPoints(b) };
		case 'pentagon':          return { kind: 'polygon', points: pentagonPoints(b) };
		case 'star':              return { kind: 'polygon', points: starPoints(b) };
		// ---- flowchart ----
		case 'terminator':        return { kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: terminatorRx(b) };
		case 'document':          return { kind: 'path', d: documentPath(b) };
		case 'multipleDocuments': return { kind: 'compound', pieces: multipleDocumentsPieces(b) };
		case 'manualInput':       return { kind: 'polygon', points: manualInputPoints(b) };
		case 'predefinedProcess': return { kind: 'path', d: predefinedProcessPath(b) };
		case 'delay':             return { kind: 'path', d: delayPath(b) };
		case 'offPageConnector':  return { kind: 'polygon', points: offPageConnectorPoints(b) };
		// ---- architecture ----
		case 'cylinder':          return { kind: 'cylinder', body: cylinderBodyPath(b), top: cylinderTopEllipse(b) };
		case 'cloud':             return { kind: 'path', d: cloudPath(b) };
		case 'queue':             return { kind: 'compound', pieces: queuePieces(b) };
		case 'server':            return { kind: 'compound', pieces: serverPieces(b) };
		case 'actor':             return { kind: 'compound', pieces: actorPieces(b) };
		case 'browser':           return { kind: 'compound', pieces: browserPieces(b) };
		case 'mobile':            return { kind: 'compound', pieces: mobilePieces(b) };
		case 'laptop':            return { kind: 'compound', pieces: laptopPieces(b) };
		case 'desktop':           return { kind: 'compound', pieces: desktopPieces(b) };
		case 'container':         return { kind: 'compound', pieces: containerPieces(b) };
		case 'gear':              return { kind: 'compound', pieces: gearPieces(b) };
		case 'loadBalancer':      return { kind: 'compound', pieces: loadBalancerPieces(b) };
		case 'firewall':          return { kind: 'compound', pieces: firewallPieces(b) };
		case 'lock':              return { kind: 'compound', pieces: lockPieces(b) };
		case 'folder':            return { kind: 'compound', pieces: folderPieces(b) };
		// ---- notes ----
		case 'card':              return { kind: 'polygon', points: cardPoints(b) };
		case 'callout':           return { kind: 'path', d: calloutPath(b) };
		case 'stickyNote':        return { kind: 'compound', pieces: stickyNotePieces(b) };
	}
}
