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
	const Types = window.CanvasNotes && window.CanvasNotes.Types;
	const isShapeType = (t) => !!(Types && Types.isShapeType && Types.isShapeType(t));
	const MIN_SHAPE_SIZE = (C && C.MIN_SHAPE_SIZE) || 8;
	const MIN_CANVAS_SIZE = (C && C.MIN_CANVAS_SIZE) || 100;

	// Text-only minimums; intentionally separate from MIN_SHAPE_SIZE so the
	// text box stays large enough to remain clickable even at the smallest
	// allowed size.
	const MIN_TEXT_WIDTH = 40;
	const MIN_TEXT_HEIGHT = 24;

	// Card-specific minimums. Sized so the body row (icon + type label) and
	// a single tag row never overlap the title bar.
	const MIN_CARD_WIDTH = (C && C.CARD_MIN_WIDTH) || 160;
	const MIN_CARD_HEIGHT = (C && C.CARD_MIN_HEIGHT) || 84;

	/** Returns a copy of the element shifted by (dx, dy) in document space. */
	function translateElement(el, dx, dy) {
		if (isShapeType(el.type)) {
			return Object.assign({}, el, { x: el.x + dx, y: el.y + dy });
		}
		switch (el.type) {
			case 'noteCard':
			case 'todoCard':
			case 'text':
				return Object.assign({}, el, { x: el.x + dx, y: el.y + dy });
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
	 * edge/corner follows the pointer. Works for any box-bounded element
	 * (shapes, cards, text). Per-type minimum size can be overridden via
	 * {minW, minH} - defaults to MIN_SHAPE_SIZE for both axes.
	 */
	function resizeBox(initial, handle, p, opts) {
		const minW = (opts && opts.minW) || MIN_SHAPE_SIZE;
		const minH = (opts && opts.minH) || MIN_SHAPE_SIZE;
		const left = initial.x;
		const top = initial.y;
		const right = left + initial.w;
		const bottom = top + initial.h;

		let x = left, y = top, right2 = right, bottom2 = bottom;
		if (handle.includes('w')) x = Math.min(p.x, right - minW);
		if (handle.includes('e')) right2 = Math.max(p.x, left + minW);
		if (handle.includes('n')) y = Math.min(p.y, bottom - minH);
		if (handle.includes('s')) bottom2 = Math.max(p.y, top + minH);

		return Object.assign({}, initial, { x, y, w: right2 - x, h: bottom2 - y });
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

	function resizeElement(current, initial, handle, p, opts) {
		if (isShapeType(initial.type)) return resizeBox(initial, handle, p);
		switch (initial.type) {
			case 'noteCard':
			case 'todoCard': {
				// Caller may override per-gesture minimums (e.g. title-driven
				// minimum width measured from the live SVG). Fall back to the
				// static card minimums otherwise.
				const minW = (opts && opts.minW) || MIN_CARD_WIDTH;
				const minH = (opts && opts.minH) || MIN_CARD_HEIGHT;
				return resizeBox(initial, handle, p, { minW, minH });
			}
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
