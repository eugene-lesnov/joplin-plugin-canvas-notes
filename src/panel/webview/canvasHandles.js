/* eslint-disable no-undef */
/**
 * Selection and canvas-resize handles.
 *
 * Provides:
 *  - per-element resize/endpoint handles for the selection overlay;
 *  - canvas-edge handles used to resize the document itself;
 *  - hit-tests for both kinds.
 *
 * Exposed as global `CanvasNotes.Handles`.
 */

(function () {
	'use strict';

	/** Visual square size of a handle in document units. */
	const HANDLE_SIZE = 8;

	function boxHandles(x, y, w, h) {
		return [
			{ name: 'nw', x: x,         y: y,         cursor: 'nwse-resize' },
			{ name: 'n',  x: x + w / 2, y: y,         cursor: 'ns-resize' },
			{ name: 'ne', x: x + w,     y: y,         cursor: 'nesw-resize' },
			{ name: 'e',  x: x + w,     y: y + h / 2, cursor: 'ew-resize' },
			{ name: 'se', x: x + w,     y: y + h,     cursor: 'nwse-resize' },
			{ name: 's',  x: x + w / 2, y: y + h,     cursor: 'ns-resize' },
			{ name: 'sw', x: x,         y: y + h,     cursor: 'nesw-resize' },
			{ name: 'w',  x: x,         y: y + h / 2, cursor: 'ew-resize' },
		];
	}

	/**
	 * Returns named handles for resizing or endpoint-editing an element.
	 * For arrows/lines the handles are 'from'/'to'; everything else uses the
	 * 8 box handles. Legacy 'circle'/'square' types map to box handles too;
	 * the editor reconciles their dimensions on resize.
	 */
	function getElementHandles(e) {
		switch (e.type) {
			case 'rectangle':
			case 'noteCard':
			case 'todoCard':
				return boxHandles(e.x, e.y, e.w, e.h);
			case 'square':
				return boxHandles(e.x, e.y, e.size, e.size);
			case 'circle':
				return boxHandles(e.cx - e.r, e.cy - e.r, e.r * 2, e.r * 2);
			case 'ellipse':
				return boxHandles(e.cx - e.rx, e.cy - e.ry, e.rx * 2, e.ry * 2);
			case 'arrow':
			case 'line':
				return [
					{ name: 'from', x: e.from.x, y: e.from.y, cursor: 'move' },
					{ name: 'to',   x: e.to.x,   y: e.to.y,   cursor: 'move' },
				];
			case 'text':
				// Text uses the full 8-handle box: corners + side midpoints.
				// All edges and corners are resizable; the anchor (x,y) adjusts
				// when the user drags a left/top side so the opposite edge stays
				// pinned. fontSize is not affected by resize.
				return boxHandles(e.x, e.y, e.width, e.height);
			default:
				return [];
		}
	}

	/**
	 * Three handles at the canvas border: right edge, bottom edge and the
	 * bottom-right corner. Sit slightly inside the canvas so they remain
	 * pointer-hittable and visually attached to the edge.
	 */
	function getCanvasHandles(doc) {
		const w = doc.width;
		const h = doc.height;
		const inset = HANDLE_SIZE / 2;
		return [
			{ name: 'e',  x: w - inset, y: h / 2,     cursor: 'ew-resize' },
			{ name: 's',  x: w / 2,     y: h - inset, cursor: 'ns-resize' },
			{ name: 'se', x: w - inset, y: h - inset, cursor: 'nwse-resize' },
		];
	}

	/** Picks an element handle near document-space point p, or null. */
	function pickElementHandleAt(e, p) {
		if (!e) return null;
		const handles = getElementHandles(e);
		const pad = HANDLE_SIZE; // hit area is 2x visual
		for (const h of handles) {
			if (Math.abs(p.x - h.x) <= pad && Math.abs(p.y - h.y) <= pad) return h;
		}
		return null;
	}

	/** Picks a canvas-resize handle near document-space point p, or null. */
	function pickCanvasHandleAt(doc, p) {
		const items = getCanvasHandles(doc);
		const pad = HANDLE_SIZE;
		for (const h of items) {
			if (Math.abs(p.x - h.x) <= pad && Math.abs(p.y - h.y) <= pad) return h;
		}
		return null;
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.Handles = {
		HANDLE_SIZE,
		getElementHandles,
		getCanvasHandles,
		pickElementHandleAt,
		pickCanvasHandleAt,
	};
})();
