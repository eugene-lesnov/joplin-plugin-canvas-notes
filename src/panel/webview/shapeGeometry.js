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

	// Predefined process: single path that combines the outer rectangle
	// with two vertical bars. One path = one stroke, avoiding the visual
	// noise from three separate elements at small sizes.
	function predefinedProcessPath(b) {
		const inset = Math.min(b.w * 0.12, 14);
		return (
			'M ' + fmt(b.x) + ' ' + fmt(b.y) +
			' L ' + fmt(b.x + b.w) + ' ' + fmt(b.y) +
			' L ' + fmt(b.x + b.w) + ' ' + fmt(b.y + b.h) +
			' L ' + fmt(b.x) + ' ' + fmt(b.y + b.h) + ' Z' +
			' M ' + fmt(b.x + inset) + ' ' + fmt(b.y) +
			' L ' + fmt(b.x + inset) + ' ' + fmt(b.y + b.h) +
			' M ' + fmt(b.x + b.w - inset) + ' ' + fmt(b.y) +
			' L ' + fmt(b.x + b.w - inset) + ' ' + fmt(b.y + b.h)
		);
	}

	// Server / rack: 3-band layout (rect + 2 horizontal dividers).
	function serverPieces(b) {
		const bandH = Math.max(8, b.h / 3);
		return [
			{ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: 2 },
			{ type: 'line', x1: b.x, y1: b.y + bandH, x2: b.x + b.w, y2: b.y + bandH },
			{ type: 'line', x1: b.x, y1: b.y + bandH * 2, x2: b.x + b.w, y2: b.y + bandH * 2 },
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

	// ---- new basic shapes ---------------------------------------------

	function pentagonPoints(b) {
		const cx = b.x + b.w / 2;
		const cy = b.y + b.h / 2;
		const rx = b.w / 2;
		const ry = b.h / 2;
		const coords = [];
		for (let i = 0; i < 5; i++) {
			const angle = -Math.PI / 2 + i * 2 * Math.PI / 5;
			coords.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
		}
		return pts(coords);
	}

	function trapezoidPoints(b) {
		const inset = Math.min(b.w * 0.2, b.h * 0.5);
		return pts([
			[b.x + inset, b.y],
			[b.x + b.w - inset, b.y],
			[b.x + b.w, b.y + b.h],
			[b.x, b.y + b.h],
		]);
	}

	// ---- flowchart ----------------------------------------------------

	function delayPath(b) {
		const r = b.h / 2;
		return (
			'M ' + fmt(b.x) + ' ' + fmt(b.y) +
			' L ' + fmt(b.x + b.w - r) + ' ' + fmt(b.y) +
			' A ' + fmt(r) + ' ' + fmt(r) + ' 0 0 1 ' + fmt(b.x + b.w - r) + ' ' + fmt(b.y + b.h) +
			' L ' + fmt(b.x) + ' ' + fmt(b.y + b.h) +
			' Z'
		);
	}

	function offPageConnectorPoints(b) {
		const foldStartY = b.y + b.h * 0.6;
		return pts([
			[b.x, b.y],
			[b.x + b.w, b.y],
			[b.x + b.w, foldStartY],
			[b.x + b.w / 2, b.y + b.h],
			[b.x, foldStartY],
		]);
	}

	function multipleDocumentsPieces(b) {
		const offset = Math.min(b.w * 0.1, b.h * 0.1, 10);
		return [
			// Single rear sheet (stroke-only) + front document with the wave.
			{ type: 'rect',
				x: b.x + offset, y: b.y,
				w: b.w - offset, h: b.h - offset,
				fillOverride: 'none' },
			{ type: 'path', d: documentPath({ x: b.x, y: b.y + offset, w: b.w - offset, h: b.h - offset }) },
		];
	}

	// ---- IT / infrastructure ------------------------------------------

	function folderPieces(b) {
		const tabW = Math.min(b.w * 0.35, 60);
		const tabH = Math.min(b.h * 0.2, 14);
		const tabSlant = Math.min(tabH * 0.5, 6);
		return [
			{ type: 'polygon', points: pts([
				[b.x, b.y],
				[b.x + tabW, b.y],
				[b.x + tabW + tabSlant, b.y + tabH],
				[b.x, b.y + tabH],
			]) },
			{ type: 'rect', x: b.x, y: b.y + tabH, w: b.w, h: b.h - tabH, rx: 2 },
		];
	}

	function browserPieces(b) {
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

	function desktopPieces(b) {
		const screenH = b.h * 0.7;
		const standW = b.w * 0.18;
		const standH = b.h * 0.12;
		const baseW = b.w * 0.4;
		const baseY = b.y + screenH + standH;
		return [
			{ type: 'rect', x: b.x, y: b.y, w: b.w, h: screenH, rx: 2 },
			{ type: 'rect', x: b.x + (b.w - standW) / 2, y: b.y + screenH, w: standW, h: standH },
			{ type: 'rect', x: b.x + (b.w - baseW) / 2, y: baseY, w: baseW, h: b.h - screenH - standH, rx: 2 },
		];
	}

	function laptopPieces(b) {
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

	function mobilePieces(b) {
		const rx = Math.min(b.w * 0.15, b.h * 0.05, 8);
		const topPad = b.h * 0.08;
		const bottomPad = b.h * 0.1;
		const sidePad = b.w * 0.08;
		const homeY = b.y + b.h - bottomPad / 2;
		const homeW = b.w * 0.3;
		return [
			{ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: rx },
			{ type: 'rect',
				x: b.x + sidePad, y: b.y + topPad,
				w: b.w - sidePad * 2, h: b.h - topPad - bottomPad,
				fillOverride: 'none' },
			{ type: 'rect',
				x: b.x + (b.w - homeW) / 2, y: homeY - 1,
				w: homeW, h: 2, rx: 1, fillOverride: 'none' },
		];
	}

	function containerPieces(b) {
		const depth = Math.min(b.w * 0.18, b.h * 0.25, 18);
		const frontX = b.x;
		const frontY = b.y + depth;
		const frontW = b.w - depth;
		const frontH = b.h - depth;
		return [
			{ type: 'polygon', points: pts([
				[frontX, frontY],
				[frontX + depth, b.y],
				[frontX + depth + frontW, b.y],
				[frontX + frontW, frontY],
			]) },
			{ type: 'polygon', points: pts([
				[frontX + frontW, frontY],
				[frontX + depth + frontW, b.y],
				[frontX + depth + frontW, b.y + frontH],
				[frontX + frontW, frontY + frontH],
			]) },
			{ type: 'rect', x: frontX, y: frontY, w: frontW, h: frontH },
		];
	}

	function gearPieces(b) {
		const cx = b.x + b.w / 2;
		const cy = b.y + b.h / 2;
		const rOuter = Math.min(b.w, b.h) / 2;
		const rInner = rOuter * 0.7;
		const rHole = rOuter * 0.32;
		const teeth = 8;
		const coords = [];
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

	function loadBalancerPieces(b) {
		const cx = b.x + b.w / 2;
		const cy = b.y + b.h / 2;
		const r = Math.min(b.w, b.h) * 0.32;
		const armLen = Math.min(b.w, b.h) * 0.25;
		return [
			{ type: 'circle', cx: cx, cy: cy, r: r },
			{ type: 'line', x1: cx - r - armLen, y1: cy, x2: cx - r, y2: cy },
			{ type: 'line', x1: cx + r, y1: cy - r * 0.5, x2: cx + r + armLen, y2: cy - r - armLen * 0.4 },
			{ type: 'line', x1: cx + r, y1: cy + r * 0.5, x2: cx + r + armLen, y2: cy + r + armLen * 0.4 },
		];
	}

	// Firewall: 2-row brick wall with staggered vertical joins.
	function firewallPieces(b) {
		const midY = b.y + b.h / 2;
		return [
			{ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h },
			{ type: 'line', x1: b.x, y1: midY, x2: b.x + b.w, y2: midY },
			{ type: 'line', x1: b.x + b.w / 2, y1: b.y, x2: b.x + b.w / 2, y2: midY },
			{ type: 'line', x1: b.x + b.w / 4, y1: midY, x2: b.x + b.w / 4, y2: b.y + b.h },
			{ type: 'line', x1: b.x + 3 * b.w / 4, y1: midY, x2: b.x + 3 * b.w / 4, y2: b.y + b.h },
		];
	}

	function lockPieces(b) {
		const bodyH = b.h * 0.6;
		const bodyY = b.y + b.h - bodyH;
		const shackleR = Math.min(b.w * 0.3, (b.h - bodyH) * 0.95);
		const shackleCx = b.x + b.w / 2;
		const shackleCy = bodyY;
		return [
			{ type: 'path', d:
				'M ' + fmt(shackleCx - shackleR) + ' ' + fmt(shackleCy) +
				' A ' + fmt(shackleR) + ' ' + fmt(shackleR) + ' 0 0 1 ' + fmt(shackleCx + shackleR) + ' ' + fmt(shackleCy),
				fillOverride: 'none' },
			{ type: 'rect', x: b.x, y: bodyY, w: b.w, h: bodyH, rx: 2 },
		];
	}

	function stickyNotePieces(b) {
		const fold = Math.min(b.w, b.h) * 0.16;
		return [
			{ type: 'polygon', points: pts([
				[b.x, b.y],
				[b.x + b.w, b.y],
				[b.x + b.w, b.y + b.h - fold],
				[b.x + b.w - fold, b.y + b.h],
				[b.x, b.y + b.h],
			]) },
			{ type: 'polygon', points: pts([
				[b.x + b.w, b.y + b.h - fold],
				[b.x + b.w - fold, b.y + b.h - fold],
				[b.x + b.w - fold, b.y + b.h],
			]), fillOverride: 'none' },
		];
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
			// primitives
			case 'rectangle':              return { kind: 'rect', x: box.x, y: box.y, w: box.w, h: box.h, rx: 0 };
			case 'ellipse':                return { kind: 'compound', pieces: [
				{ type: 'ellipse', cx: box.x + box.w / 2, cy: box.y + box.h / 2, rx: box.w / 2, ry: box.h / 2 },
			] };
			case 'roundedRectangle':       return { kind: 'rect', x: box.x, y: box.y, w: box.w, h: box.h, rx: roundedRectangleRx(box) };
			case 'triangle':               return { kind: 'polygon', points: trianglePoints(box) };
			case 'diamond':                return { kind: 'polygon', points: diamondPoints(box) };
			case 'parallelogram':          return { kind: 'polygon', points: parallelogramPoints(box) };
			case 'trapezoid':              return { kind: 'polygon', points: trapezoidPoints(box) };
			case 'hexagon':                return { kind: 'polygon', points: hexagonPoints(box) };
			case 'pentagon':               return { kind: 'polygon', points: pentagonPoints(box) };
			case 'star':                   return { kind: 'polygon', points: starPoints(box) };
			// flowchart
			case 'terminator':             return { kind: 'rect', x: box.x, y: box.y, w: box.w, h: box.h, rx: terminatorRx(box) };
			case 'document':               return { kind: 'path', d: documentPath(box) };
			case 'multipleDocuments':      return { kind: 'compound', pieces: multipleDocumentsPieces(box) };
			case 'manualInput':            return { kind: 'polygon', points: manualInputPoints(box) };
			case 'predefinedProcess':      return { kind: 'path', d: predefinedProcessPath(box) };
			case 'delay':                  return { kind: 'path', d: delayPath(box) };
			case 'offPageConnector':       return { kind: 'polygon', points: offPageConnectorPoints(box) };
			// architecture
			case 'cylinder':               return { kind: 'cylinder', body: cylinderBodyPath(box), top: cylinderTopEllipse(box) };
			case 'cloud':                  return { kind: 'path', d: cloudPath(box) };
			case 'queue':                  return { kind: 'compound', pieces: queuePieces(box) };
			case 'server':                 return { kind: 'compound', pieces: serverPieces(box) };
			case 'actor':                  return { kind: 'compound', pieces: actorPieces(box) };
			case 'browser':                return { kind: 'compound', pieces: browserPieces(box) };
			case 'mobile':                 return { kind: 'compound', pieces: mobilePieces(box) };
			case 'laptop':                 return { kind: 'compound', pieces: laptopPieces(box) };
			case 'desktop':                return { kind: 'compound', pieces: desktopPieces(box) };
			case 'container':              return { kind: 'compound', pieces: containerPieces(box) };
			case 'gear':                   return { kind: 'compound', pieces: gearPieces(box) };
			case 'loadBalancer':           return { kind: 'compound', pieces: loadBalancerPieces(box) };
			case 'firewall':               return { kind: 'compound', pieces: firewallPieces(box) };
			case 'lock':                   return { kind: 'compound', pieces: lockPieces(box) };
			case 'folder':                 return { kind: 'compound', pieces: folderPieces(box) };
			// notes
			case 'card':                   return { kind: 'polygon', points: cardPoints(box) };
			case 'callout':                return { kind: 'path', d: calloutPath(box) };
			case 'stickyNote':             return { kind: 'compound', pieces: stickyNotePieces(box) };
			default:                       return null;
		}
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.ShapeGeometry = { shapeDraw };
})();
