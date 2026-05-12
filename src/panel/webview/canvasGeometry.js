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

	/** Hit-tests document-space point (px, py) against the element. */
	function hitTest(e, px, py) {
		if (e.type === 'arrow' || e.type === 'line') {
			return distToSegment({ x: px, y: py }, e.from, e.to) <= strokeHitRadius(e.strokeWidth);
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
	};
})();
