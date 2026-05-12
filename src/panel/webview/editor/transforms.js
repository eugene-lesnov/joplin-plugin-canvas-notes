/* eslint-disable no-undef */
/**
 * Element-mutation helpers for translate / resize.
 *
 * Pure functions that take the current element shape, the user pointer
 * data and return a new element. They never mutate the input.
 *
 * Exposed as `window.CanvasNotes.EditorTransforms`.
 */

(function () {
	'use strict';

	const C = window.CanvasNotes && window.CanvasNotes.EditorConstants;
	const MIN_SHAPE_SIZE = (C && C.MIN_SHAPE_SIZE) || 8;
	const MIN_CANVAS_SIZE = (C && C.MIN_CANVAS_SIZE) || 100;

	// Text-only minimums; intentionally separate from MIN_SHAPE_SIZE so the
	// text box stays large enough to remain clickable even at the smallest
	// allowed size.
	const MIN_TEXT_WIDTH = 40;
	const MIN_TEXT_HEIGHT = 24;

	function clampMin(v) { return Math.max(MIN_SHAPE_SIZE, v); }

	/** Returns a copy of the element shifted by (dx, dy) in document space. */
	function translateElement(el, dx, dy) {
		switch (el.type) {
			case 'rectangle':
			case 'square':
			case 'shape':
			case 'noteCard':
			case 'todoCard':
			case 'text':
				return Object.assign({}, el, { x: el.x + dx, y: el.y + dy });
			case 'circle':
			case 'ellipse':
				return Object.assign({}, el, { cx: el.cx + dx, cy: el.cy + dy });
			case 'arrow':
			case 'line':
				return Object.assign({}, el, {
					from: Object.assign({}, el.from, { x: el.from.x + dx, y: el.from.y + dy }),
					to:   Object.assign({}, el.to,   { x: el.to.x   + dx, y: el.to.y   + dy }),
				});
			case 'freehand':
				return Object.assign({}, el, {
					points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
				});
			default:
				return el;
		}
	}

	/**
	 * Free-form box resize: the opposite edge stays fixed and the dragged
	 * edge/corner follows the pointer. Works for rectangles, cards, and
	 * the legacy 'square' type.
	 */
	function resizeBox(initial, handle, p) {
		const left = initial.x;
		const top = initial.y;
		const right = left + initial.w;
		const bottom = top + initial.h;

		let x = left, y = top, right2 = right, bottom2 = bottom;
		if (handle.includes('w')) x = Math.min(p.x, right - MIN_SHAPE_SIZE);
		if (handle.includes('e')) right2 = Math.max(p.x, left + MIN_SHAPE_SIZE);
		if (handle.includes('n')) y = Math.min(p.y, bottom - MIN_SHAPE_SIZE);
		if (handle.includes('s')) bottom2 = Math.max(p.y, top + MIN_SHAPE_SIZE);

		return Object.assign({}, initial, { x, y, w: right2 - x, h: bottom2 - y });
	}

	/**
	 * Legacy SquareElement uses a single `size`. We migrate it to a free-form
	 * box so the user gets the same resize UX as rectangles, then collapse
	 * the result back to a single `size` (the bigger dimension wins).
	 */
	function resizeSquare(initial, handle, p) {
		const rect = resizeBox(
			{ type: 'rectangle', x: initial.x, y: initial.y, w: initial.size, h: initial.size },
			handle, p,
		);
		const size = Math.max(rect.w, rect.h);
		return Object.assign({}, initial, { x: rect.x, y: rect.y, size });
	}

	/** Free-form ellipse resize via bbox handles. */
	function resizeEllipse(initial, handle, p) {
		const rect = resizeBox(
			{
				type: 'rectangle',
				x: initial.cx - initial.rx,
				y: initial.cy - initial.ry,
				w: initial.rx * 2,
				h: initial.ry * 2,
			},
			handle, p,
		);
		const rx = clampMin(rect.w / 2);
		const ry = clampMin(rect.h / 2);
		return Object.assign({}, initial, { cx: rect.x + rx, cy: rect.y + ry, rx, ry });
	}

	/**
	 * Legacy circle resize: route through the bbox algorithm so the user
	 * gets the same free-form behavior, then keep the model as a circle
	 * with r = max(rx, ry).
	 */
	function resizeLegacyCircle(initial, handle, p) {
		const rect = resizeBox(
			{
				type: 'rectangle',
				x: initial.cx - initial.r,
				y: initial.cy - initial.r,
				w: initial.r * 2,
				h: initial.r * 2,
			},
			handle, p,
		);
		const r = clampMin(Math.max(rect.w, rect.h) / 2);
		return Object.assign({}, initial, {
			cx: rect.x + rect.w / 2,
			cy: rect.y + rect.h / 2,
			r,
		});
	}

	/**
	 * Text resize via any of the 8 box handles. Mirrors resizeBox but
	 * operates on (x, y, width, height) and uses text-specific minimums.
	 * fontSize is left untouched.
	 */
	function resizeText(initial, handle, p) {
		const left = initial.x;
		const top = initial.y;
		const right = left + initial.width;
		const bottom = top + initial.height;

		let x = left, y = top, r = right, b = bottom;
		if (handle.indexOf('w') >= 0) x = Math.min(p.x, right - MIN_TEXT_WIDTH);
		if (handle.indexOf('e') >= 0) r = Math.max(p.x, left + MIN_TEXT_WIDTH);
		if (handle.indexOf('n') >= 0) y = Math.min(p.y, bottom - MIN_TEXT_HEIGHT);
		if (handle.indexOf('s') >= 0) b = Math.max(p.y, top + MIN_TEXT_HEIGHT);

		return Object.assign({}, initial, { x, y, width: r - x, height: b - y });
	}

	function resizeElement(current, initial, handle, p) {
		switch (initial.type) {
			case 'rectangle':
			case 'shape':
			case 'noteCard':
			case 'todoCard':
				return resizeBox(initial, handle, p);
			case 'square':
				return resizeSquare(initial, handle, p);
			case 'ellipse':
				return resizeEllipse(initial, handle, p);
			case 'circle':
				return resizeLegacyCircle(initial, handle, p);
			case 'arrow':
			case 'line':
				if (handle === 'from') {
					return Object.assign({}, initial, {
						from: Object.assign({}, initial.from, { x: p.x, y: p.y }),
					});
				}
				return Object.assign({}, initial, {
					to: Object.assign({}, initial.to, { x: p.x, y: p.y }),
				});
			case 'text':
				return resizeText(initial, handle, p);
			default:
				return current;
		}
	}

	/**
	 * Computes the canvas (doc.width / doc.height) update for a live drag
	 * from a canvas-edge handle. Returns { width, height } - never below
	 * MIN_CANVAS_SIZE on either axis.
	 */
	function resizeCanvas(state, p) {
		let w = state.initialW;
		let h = state.initialH;
		if (state.handle.includes('e')) w = Math.max(MIN_CANVAS_SIZE, p.x);
		if (state.handle.includes('s')) h = Math.max(MIN_CANVAS_SIZE, p.y);
		return { width: w, height: h };
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.EditorTransforms = {
		translateElement,
		resizeElement,
		resizeCanvas,
	};
})();
