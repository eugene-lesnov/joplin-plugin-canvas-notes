/* eslint-disable no-undef */
/**
 * Element factories for the Canvas Editor.
 *
 * Each factory builds a fully-formed CanvasElement with a fresh id and the
 * default visual style. Callers (the controller) pick the factory based on
 * the active tool.
 *
 * Exposed as `window.CanvasNotes.EditorFactories`.
 */

(function () {
	'use strict';

	const C = window.CanvasNotes && window.CanvasNotes.EditorConstants;

	function newId() {
		if (window.crypto && typeof window.crypto.randomUUID === 'function') {
			return window.crypto.randomUUID();
		}
		const rand = Math.random().toString(36).slice(2, 10);
		return `el-${Date.now().toString(36)}-${rand}`;
	}

	/**
	 * Square tool creates a free-form rectangle (model type 'rectangle')
	 * so it can be stretched along either axis from any handle.
	 */
	function makeRectangle(p, nextZ) {
		return {
			id: newId(), type: 'rectangle', z: nextZ,
			x: p.x - C.DEFAULT_SQUARE / 2, y: p.y - C.DEFAULT_SQUARE / 2,
			w: C.DEFAULT_SQUARE, h: C.DEFAULT_SQUARE,
			fill: C.DEFAULT_FILL, stroke: C.DEFAULT_STROKE, strokeWidth: C.DEFAULT_STROKE_WIDTH,
		};
	}

	/**
	 * Circle tool creates a free-form ellipse so it can be stretched
	 * along any axis. Initial rx === ry so the shape looks circular.
	 */
	function makeEllipse(p, nextZ) {
		return {
			id: newId(), type: 'ellipse', z: nextZ,
			cx: p.x, cy: p.y, rx: C.DEFAULT_CIRCLE_R, ry: C.DEFAULT_CIRCLE_R,
			fill: C.DEFAULT_FILL, stroke: C.DEFAULT_STROKE, strokeWidth: C.DEFAULT_STROKE_WIDTH,
		};
	}

	function makeSegment(type, from, to, nextZ) {
		return {
			id: newId(), type, z: nextZ,
			from: { x: from.x, y: from.y },
			to:   { x: to.x,   y: to.y   },
			stroke: C.DEFAULT_STROKE, strokeWidth: C.DEFAULT_STROKE_WIDTH,
		};
	}

	function makeFreehand(points, nextZ) {
		return {
			id: newId(), type: 'freehand', z: nextZ,
			points: points.map((p) => ({ x: p.x, y: p.y })),
			stroke: C.DEFAULT_STROKE, strokeWidth: C.DEFAULT_STROKE_WIDTH,
		};
	}

	const TEXT_DEFAULT_W = 200;
	const TEXT_DEFAULT_H = 80;
	const TEXT_DEFAULT_FONT_SIZE = 16;

	/**
	 * Creates a TextElement anchored at click position p. The user-provided
	 * string is stored verbatim; rendering and SVG serialization handle
	 * escaping and line splitting on their own.
	 */
	function makeText(p, nextZ, text) {
		return {
			id: newId(), type: 'text', z: nextZ,
			x: p.x, y: p.y,
			width: TEXT_DEFAULT_W,
			height: TEXT_DEFAULT_H,
			text: text,
			fontSize: TEXT_DEFAULT_FONT_SIZE,
			sizingMode: 'fixed',
		};
	}

	/**
	 * Builds either a noteCard or todoCard from a search-result summary.
	 * The card is centered around `centerDoc` (document space).
	 */
	function makeCardFromSummary(summary, centerDoc, nextZ) {
		const x = centerDoc.x - C.DEFAULT_CARD_W / 2;
		const y = centerDoc.y - C.DEFAULT_CARD_H / 2;
		const base = {
			id: newId(), z: nextZ,
			x, y, w: C.DEFAULT_CARD_W, h: C.DEFAULT_CARD_H,
			noteId: summary.id,
			title: summary.title || '(untitled)',
			preview: summary.preview || '',
		};
		if (summary.isTodo) {
			return Object.assign({}, base, {
				type: 'todoCard',
				completed: !!summary.todoCompleted,
			});
		}
		return Object.assign({}, base, { type: 'noteCard' });
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.EditorFactories = {
		newId,
		makeRectangle,
		makeEllipse,
		makeArrow: (from, to, z) => makeSegment('arrow', from, to, z),
		makeLine:  (from, to, z) => makeSegment('line',  from, to, z),
		makeFreehand,
		makeText,
		makeCardFromSummary,
	};
})();
