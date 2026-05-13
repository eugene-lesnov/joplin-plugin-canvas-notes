/* eslint-disable no-undef */
/**
 * Webview-side mirror of src/canvas/canvasTypes.ts.
 *
 * Provides the ShapeType registry and the `isShapeType` predicate so
 * geometry, renderer, handles and the controller can branch on the
 * unified shape model without duplicating the list.
 *
 * Exposed as `window.CanvasNotes.Types`.
 */

(function () {
	'use strict';

	/** Mirrors `ShapeType` / `SHAPE_TYPES` in canvasTypes.ts. */
	const SHAPE_TYPES = [
		'rectangle', 'ellipse', 'roundedRectangle',
		'triangle', 'diamond', 'parallelogram', 'trapezoid',
		'hexagon', 'pentagon', 'star',
		'terminator', 'document', 'multipleDocuments',
		'manualInput', 'predefinedProcess', 'delay', 'offPageConnector',
		'cylinder', 'cloud', 'queue', 'server', 'actor',
		'browser', 'mobile', 'laptop', 'desktop', 'container',
		'gear', 'loadBalancer', 'firewall', 'lock', 'folder',
		'card', 'callout', 'stickyNote',
	];

	const SHAPE_TYPE_SET = new Set(SHAPE_TYPES);

	function isShapeType(t) {
		return typeof t === 'string' && SHAPE_TYPE_SET.has(t);
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.Types = {
		SHAPE_TYPES,
		isShapeType,
	};
})();
