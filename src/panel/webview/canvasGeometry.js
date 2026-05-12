/* eslint-disable no-undef */
/**
 * Pure geometry helpers shared by the renderer and the editor controller.
 *
 * Has no DOM access, no SVG rendering. Operates on raw element shapes
 * (the same JSON model the backend serializes/parses).
 *
 * Exposed as global `CanvasNotes.Geometry`.
 */

(function () {
	'use strict';

	/** Returns the axis-aligned bbox of an element in document space. */
	function elementBBox(e) {
		switch (e.type) {
			case 'rectangle':
				return { x: e.x, y: e.y, w: e.w, h: e.h };
			case 'square':
				return { x: e.x, y: e.y, w: e.size, h: e.size };
			case 'circle':
				return { x: e.cx - e.r, y: e.cy - e.r, w: e.r * 2, h: e.r * 2 };
			case 'ellipse':
				return { x: e.cx - e.rx, y: e.cy - e.ry, w: e.rx * 2, h: e.ry * 2 };
			case 'shape':
				return { x: e.x, y: e.y, w: e.w, h: e.h };
			case 'arrow':
			case 'line': {
				const x = Math.min(e.from.x, e.to.x);
				const y = Math.min(e.from.y, e.to.y);
				const w = Math.abs(e.to.x - e.from.x);
				const h = Math.abs(e.to.y - e.from.y);
				return { x, y, w, h };
			}
			case 'freehand': {
				let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
				for (const p of e.points || []) {
					if (p.x < minX) minX = p.x;
					if (p.y < minY) minY = p.y;
					if (p.x > maxX) maxX = p.x;
					if (p.y > maxY) maxY = p.y;
				}
				if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
				return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
			}
			case 'noteCard':
			case 'todoCard':
				return { x: e.x, y: e.y, w: e.w, h: e.h };
			case 'text':
				return { x: e.x, y: e.y, w: e.width, h: e.height };
			default:
				return { x: 0, y: 0, w: 0, h: 0 };
		}
	}

	/** Distance from point p to line segment [a, b]. */
	function distToSegment(p, a, b) {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len2 = dx * dx + dy * dy;
		if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
		let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
		t = Math.max(0, Math.min(1, t));
		const cx = a.x + t * dx;
		const cy = a.y + t * dy;
		return Math.hypot(p.x - cx, p.y - cy);
	}

	/** Generous click tolerance around thin strokes. */
	const STROKE_HIT_PAD = 8;
	const STROKE_HIT_MIN_RADIUS = 12;

	/** Effective half-thickness of the click target around a stroke of width sw. */
	function strokeHitRadius(sw) {
		const half = (sw || 0) / 2;
		return Math.max(STROKE_HIT_MIN_RADIUS, half + STROKE_HIT_PAD);
	}

	/**
	 * Estimates the on-screen bounding box of a line-label rectangle in
	 * local (line-aligned) coordinates: width by text length and font,
	 * height by line count. Returns null if there is no visible label.
	 * Local coords mean: origin = midpoint, x along the line, y across.
	 */
	function lineLabelLocalBox(e) {
		const label = e && e.label;
		if (!label || !label.text) return null;
		const fontSize = label.fontSize || 14;
		const lines = String(label.text).split('\n');
		let longest = 0;
		for (const l of lines) if (l.length > longest) longest = l.length;
		// Same heuristics as the renderer (AVG_CHAR_WIDTH_RATIO = 0.6,
		// TEXT_LINE_HEIGHT_RATIO = 1.2). Add a generous hit-tolerance pad
		// so the user does not have to land exactly on the glyphs.
		const pad = 6;
		const width = Math.max(1, longest * fontSize * 0.6) + pad * 2;
		const height = Math.max(1, lines.length * fontSize * 1.2) + pad * 2;
		return { width, height };
	}

	/**
	 * Hit-test the embedded label of a line/arrow element. Handles both
	 * orientations: 'parallel' (rotated around midpoint) and 'horizontal'.
	 */
	function hitTestLineLabel(e, px, py) {
		const box = lineLabelLocalBox(e);
		if (!box) return false;
		const cx = (e.from.x + e.to.x) / 2;
		const cy = (e.from.y + e.to.y) / 2;
		const orientation = (e.label && e.label.orientation) || 'parallel';

		if (orientation === 'horizontal') {
			// Box centered on midpoint.
			return Math.abs(px - cx) <= box.width / 2
				&& Math.abs(py - cy) <= box.height / 2;
		}

		// Parallel: text is placed ABOVE the line in local coords (negative
		// y direction). Inverse-rotate the test point into local space.
		const dx = e.to.x - e.from.x;
		const dy = e.to.y - e.from.y;
		const len = Math.hypot(dx, dy);
		if (len < 1) return false;
		let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
		if (angleDeg > 90) angleDeg -= 180;
		else if (angleDeg < -90) angleDeg += 180;
		const angle = angleDeg * Math.PI / 180;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const lx = (px - cx) * cos + (py - cy) * sin;
		const ly = -(px - cx) * sin + (py - cy) * cos;
		const strokeWidth = e.strokeWidth || 1;
		const fontSize = (e.label && e.label.fontSize) || 14;
		const gap = Math.max(fontSize * 0.3, strokeWidth + 2);
		// Label block sits in local y in [-(gap + height), -gap].
		return Math.abs(lx) <= box.width / 2
			&& ly <= -gap
			&& ly >= -gap - box.height;
	}

	/** Hit-tests document-space point (px, py) against the element. */
	function hitTest(e, px, py) {
		if (e.type === 'arrow' || e.type === 'line') {
			if (distToSegment({ x: px, y: py }, e.from, e.to) <= strokeHitRadius(e.strokeWidth)) {
				return true;
			}
			// Click landed away from the stroke - also accept hits on the
			// label so the user can grab the line by its caption (and so
			// dbl-click on the label opens the label editor).
			return hitTestLineLabel(e, px, py);
		}
		if (e.type === 'freehand') {
			const r = strokeHitRadius(e.strokeWidth);
			const pts = e.points || [];
			for (let i = 1; i < pts.length; i++) {
				if (distToSegment({ x: px, y: py }, pts[i - 1], pts[i]) <= r) return true;
			}
			return false;
		}
		const b = elementBBox(e);
		return px >= b.x && py >= b.y && px <= b.x + b.w && py <= b.y + b.h;
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.Geometry = {
		elementBBox,
		distToSegment,
		strokeHitRadius,
		hitTest,
		hitTestLineLabel,
	};
})();
