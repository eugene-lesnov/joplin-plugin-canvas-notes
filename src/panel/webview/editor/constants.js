/* eslint-disable no-undef */
/**
 * Magic constants used across the Canvas Editor webview.
 *
 * Kept in one place so the values stay consistent between factories,
 * transforms, the controller and the temporary-preview overlay.
 *
 * Exposed as `window.CanvasNotes.EditorConstants`.
 */

(function () {
	'use strict';

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.EditorConstants = {
		// Visual defaults for newly created shapes.
		DEFAULT_FILL: '#e8f0fe',
		DEFAULT_STROKE: '#34495e',
		DEFAULT_STROKE_WIDTH: 2,

		// Default sizes.
		DEFAULT_SQUARE: 120,
		DEFAULT_CIRCLE_R: 60,
		DEFAULT_CARD_W: 220,
		DEFAULT_CARD_H: 100,

		// Pointer thresholds.
		DRAG_THRESHOLD_PX: 3,
		PEN_MIN_DISTANCE: 1.5,

		// Save lifecycle.
		AUTOSAVE_DEBOUNCE_MS: 1500,

		// Zoom.
		ZOOM_MIN: 0.25,
		ZOOM_MAX: 4,
		ZOOM_STEP: 1.25,

		// Resize bounds.
		MIN_SHAPE_SIZE: 8,
		MIN_CANVAS_SIZE: 100,

		/**
		 * Minimum drag distance (in document pixels) along each axis that
		 * promotes a shape drag-create to a custom-sized box. Smaller
		 * gestures (incl. a plain click) fall back to default sized shape
		 * anchored at the click point.
		 */
		SHAPE_DRAG_MIN_SIZE: 8,

		/**
		 * Tools that should KEEP being active after creating an element.
		 * Drawing tools are typically used to make several strokes in a row;
		 * switching back to Select would be annoying.
		 */
		STICKY_TOOLS: new Set([
			'line', 'arrow', 'biarrow',
			'line-dashed', 'line-dotted', 'line-thick', 'arrow-dashed',
			'arrow-inheritance', 'arrow-realization',
			'arrow-aggregation', 'arrow-composition', 'arrow-dependency',
			'pen',
		]),
	};
})();
