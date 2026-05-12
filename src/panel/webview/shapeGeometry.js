/* eslint-disable no-undef */
/**
 * Pure path/polygon math for the unified `shape` element type.
 *
 * Mirror of src/canvas/shapeGeometry.ts so the in-app DOM renderer and
 * the saved SVG produce visually identical results. The TS side is
 * authoritative; any change must be applied to both files.
 *
 * Exposed as `window.CanvasNotes.ShapeGeometry`.
 */

(function () {
	'use strict';

	function fmt(n) {
		if (!Number.isFinite(n)) return '0';
		// Match the TS `formatNumber` behavior: short, no trailing zeros.
		const rounded = Math.round(n * 1000) / 1000;
		return String(rounded);
	}

	function pts(coords) {
		return coords.map(function (c) { return fmt(c[0]) + ',' + fmt(c[1]); }).join(' ');
	}

	function diamondPoints(b) {
		const cx = b.x + b.w / 2;
		const cy = b.y + b.h / 2;
		return pts([
			[cx, b.y],
			[b.x + b.w, cy],
			[cx, b.y + b.h],
			[b.x, cy],
		]);
	}

	function parallelogramPoints(b) {
		const skew = Math.min(b.w * 0.25, b.h * 0.6);
		return pts([
			[b.x + skew, b.y],
			[b.x + b.w, b.y],
			[b.x + b.w - skew, b.y + b.h],
			[b.x, b.y + b.h],
		]);
	}

	function hexagonPoints(b) {
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

	function trianglePoints(b) {
		return pts([
			[b.x + b.w / 2, b.y],
			[b.x + b.w, b.y + b.h],
			[b.x, b.y + b.h],
		]);
	}

	function cardPoints(b) {
		const fold = Math.min(b.w, b.h) * 0.18;
		return pts([
			[b.x, b.y],
			[b.x + b.w - fold, b.y],
			[b.x + b.w, b.y + fold],
			[b.x + b.w, b.y + b.h],
			[b.x, b.y + b.h],
		]);
	}

	function cylinderTopEllipse(b) {
		const rx = b.w / 2;
		const ry = Math.min(b.h * 0.15, b.w * 0.25);
		return { cx: b.x + rx, cy: b.y + ry, rx: rx, ry: ry };
	}

	function cylinderBodyPath(b) {
		const top = cylinderTopEllipse(b);
		const bottom = b.y + b.h - top.ry;
		return (
			'M ' + fmt(b.x) + ' ' + fmt(b.y + top.ry) +
			' L ' + fmt(b.x) + ' ' + fmt(bottom) +
			' A ' + fmt(top.rx) + ' ' + fmt(top.ry) + ' 0 0 0 ' + fmt(b.x + b.w) + ' ' + fmt(bottom) +
			' L ' + fmt(b.x + b.w) + ' ' + fmt(b.y + top.ry) +
			' A ' + fmt(top.rx) + ' ' + fmt(top.ry) + ' 0 0 0 ' + fmt(b.x) + ' ' + fmt(b.y + top.ry) +
			' Z'
		);
	}

	function cloudPath(b) {
		const x = b.x, y = b.y, w = b.w, h = b.h;
		const dx = w / 6;
		const dy = h / 4;
		return (
			'M ' + fmt(x + dx) + ' ' + fmt(y + h * 0.7) +
			' C ' + fmt(x) + ' ' + fmt(y + h * 0.7) + ', ' + fmt(x) + ' ' + fmt(y + h * 0.3) + ', ' + fmt(x + dx) + ' ' + fmt(y + h * 0.3) +
			' C ' + fmt(x + dx) + ' ' + fmt(y) + ', ' + fmt(x + w * 0.5) + ' ' + fmt(y) + ', ' + fmt(x + w * 0.5) + ' ' + fmt(y + dy) +
			' C ' + fmt(x + w * 0.55) + ' ' + fmt(y) + ', ' + fmt(x + w - dx) + ' ' + fmt(y) + ', ' + fmt(x + w - dx) + ' ' + fmt(y + h * 0.3) +
			' C ' + fmt(x + w) + ' ' + fmt(y + h * 0.3) + ', ' + fmt(x + w) + ' ' + fmt(y + h * 0.7) + ', ' + fmt(x + w - dx) + ' ' + fmt(y + h * 0.7) +
			' C ' + fmt(x + w) + ' ' + fmt(y + h) + ', ' + fmt(x + w * 0.55) + ' ' + fmt(y + h) + ', ' + fmt(x + w * 0.5) + ' ' + fmt(y + h - dy) +
			' C ' + fmt(x + w * 0.5) + ' ' + fmt(y + h) + ', ' + fmt(x + dx) + ' ' + fmt(y + h) + ', ' + fmt(x + dx) + ' ' + fmt(y + h * 0.7) +
			' Z'
		);
	}

	function calloutPath(b) {
		const r = Math.min(8, b.w / 8, b.h / 8);
		const pointerH = Math.min(12, b.h * 0.2);
		const pointerW = Math.min(14, b.w * 0.18);
		const bodyBottom = b.y + b.h - pointerH;
		const px = b.x + b.w * 0.18;
		return (
			'M ' + fmt(b.x + r) + ' ' + fmt(b.y) +
			' L ' + fmt(b.x + b.w - r) + ' ' + fmt(b.y) +
			' Q ' + fmt(b.x + b.w) + ' ' + fmt(b.y) + ', ' + fmt(b.x + b.w) + ' ' + fmt(b.y + r) +
			' L ' + fmt(b.x + b.w) + ' ' + fmt(bodyBottom - r) +
			' Q ' + fmt(b.x + b.w) + ' ' + fmt(bodyBottom) + ', ' + fmt(b.x + b.w - r) + ' ' + fmt(bodyBottom) +
			' L ' + fmt(px + pointerW) + ' ' + fmt(bodyBottom) +
			' L ' + fmt(px) + ' ' + fmt(b.y + b.h) +
			' L ' + fmt(px + pointerW * 0.5) + ' ' + fmt(bodyBottom) +
			' L ' + fmt(b.x + r) + ' ' + fmt(bodyBottom) +
			' Q ' + fmt(b.x) + ' ' + fmt(bodyBottom) + ', ' + fmt(b.x) + ' ' + fmt(bodyBottom - r) +
			' L ' + fmt(b.x) + ' ' + fmt(b.y + r) +
			' Q ' + fmt(b.x) + ' ' + fmt(b.y) + ', ' + fmt(b.x + r) + ' ' + fmt(b.y) +
			' Z'
		);
	}

	function roundedRectangleRx(b) {
		return Math.min(12, b.w / 5, b.h / 5);
	}

	function terminatorRx(b) {
		return Math.min(b.w, b.h) / 2;
	}

	function manualInputPoints(b) {
		const slant = Math.min(b.h * 0.3, b.w * 0.2);
		return pts([
			[b.x, b.y + slant],
			[b.x + b.w, b.y],
			[b.x + b.w, b.y + b.h],
			[b.x, b.y + b.h],
		]);
	}

	function starPoints(b) {
		const cx = b.x + b.w / 2;
		const cy = b.y + b.h / 2;
		const rOuter = Math.min(b.w, b.h) / 2;
		const rInner = rOuter * 0.4;
		const coords = [];
		for (let i = 0; i < 10; i++) {
			const angle = -Math.PI / 2 + i * Math.PI / 5;
			const r = i % 2 === 0 ? rOuter : rInner;
			coords.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
		}
		return pts(coords);
	}

	function predefinedProcessPieces(b) {
		const inset = Math.min(b.w * 0.12, 14);
		return [
			{ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h },
			{ type: 'line', x1: b.x + inset, y1: b.y, x2: b.x + inset, y2: b.y + b.h },
			{ type: 'line', x1: b.x + b.w - inset, y1: b.y, x2: b.x + b.w - inset, y2: b.y + b.h },
		];
	}

	function serverPieces(b) {
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

	function actorPieces(b) {
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

	function queuePieces(b) {
		const rx = Math.min(b.w * 0.15, b.h * 0.5);
		const ry = b.h / 2;
		return [
			{ type: 'path', d:
				'M ' + fmt(b.x + rx) + ' ' + fmt(b.y) +
				' L ' + fmt(b.x + b.w) + ' ' + fmt(b.y) +
				' L ' + fmt(b.x + b.w) + ' ' + fmt(b.y + b.h) +
				' L ' + fmt(b.x + rx) + ' ' + fmt(b.y + b.h) +
				' A ' + fmt(rx) + ' ' + fmt(ry) + ' 0 0 1 ' + fmt(b.x + rx) + ' ' + fmt(b.y) +
				' Z',
			},
			{ type: 'ellipse', cx: b.x + rx, cy: b.y + ry, rx: rx, ry: ry, fillOverride: 'none' },
		];
	}

	function documentPath(b) {
		const x = b.x, y = b.y, w = b.w, h = b.h;
		const waveAmp = Math.min(h * 0.15, 16);
		const midX = x + w / 2;
		const baseY = y + h - waveAmp / 2;
		return (
			'M ' + fmt(x) + ' ' + fmt(y) +
			' L ' + fmt(x + w) + ' ' + fmt(y) +
			' L ' + fmt(x + w) + ' ' + fmt(baseY) +
			' C ' + fmt(x + w * 0.75) + ' ' + fmt(baseY + waveAmp) + ', ' + fmt(midX) + ' ' + fmt(baseY - waveAmp) + ', ' + fmt(midX) + ' ' + fmt(baseY) +
			' C ' + fmt(x + w * 0.25) + ' ' + fmt(baseY + waveAmp) + ', ' + fmt(x) + ' ' + fmt(baseY - waveAmp) + ', ' + fmt(x) + ' ' + fmt(baseY) +
			' Z'
		);
	}

	/**
	 * Returns a drawing description for the given shape kind and box.
	 * Result shape:
	 *   { kind: 'polygon', points: '...' }
	 *   { kind: 'path',    d: '...' }
	 *   { kind: 'cylinder', body: '...', top: {cx,cy,rx,ry} }
	 */
	function shapeDraw(kind, b) {
		// Normalize negative dimensions so renderers always work on
		// absolute bounds (live drag-create can produce negatives).
		const box = {
			x: b.w >= 0 ? b.x : b.x + b.w,
			y: b.h >= 0 ? b.y : b.y + b.h,
			w: Math.abs(b.w),
			h: Math.abs(b.h),
		};
		switch (kind) {
			case 'diamond':           return { kind: 'polygon', points: diamondPoints(box) };
			case 'parallelogram':     return { kind: 'polygon', points: parallelogramPoints(box) };
			case 'hexagon':           return { kind: 'polygon', points: hexagonPoints(box) };
			case 'triangle':          return { kind: 'polygon', points: trianglePoints(box) };
			case 'card':              return { kind: 'polygon', points: cardPoints(box) };
			case 'cloud':             return { kind: 'path', d: cloudPath(box) };
			case 'callout':           return { kind: 'path', d: calloutPath(box) };
			case 'document':          return { kind: 'path', d: documentPath(box) };
			case 'cylinder':          return { kind: 'cylinder', body: cylinderBodyPath(box), top: cylinderTopEllipse(box) };
			case 'roundedRectangle':  return { kind: 'rect', x: box.x, y: box.y, w: box.w, h: box.h, rx: roundedRectangleRx(box) };
			case 'terminator':        return { kind: 'rect', x: box.x, y: box.y, w: box.w, h: box.h, rx: terminatorRx(box) };
			case 'manualInput':       return { kind: 'polygon', points: manualInputPoints(box) };
			case 'star':              return { kind: 'polygon', points: starPoints(box) };
			case 'predefinedProcess': return { kind: 'compound', pieces: predefinedProcessPieces(box) };
			case 'server':            return { kind: 'compound', pieces: serverPieces(box) };
			case 'actor':             return { kind: 'compound', pieces: actorPieces(box) };
			case 'queue':             return { kind: 'compound', pieces: queuePieces(box) };
			default:                  return null;
		}
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.ShapeGeometry = { shapeDraw };
})();
