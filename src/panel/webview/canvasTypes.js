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
		// Basic / General.
		'rectangle', 'roundedRectangle', 'ellipse',
		'triangle', 'diamond', 'hexagon', 'parallelogram', 'trapezoid',
		'cloud', 'cylinder', 'star', 'heart', 'envelope', 'folder',
		// Flowchart.
		'terminator', 'document', 'multipleDocuments',
		'manualInput', 'predefinedProcess', 'delay', 'offPageConnector',
		// Containers.
		'container', 'swimlane', 'table',
		// Data / Documents.
		'storedData', 'punchedTape',
		// Architecture / Infrastructure.
		'server', 'queue', 'actor', 'gear', 'loadBalancer', 'firewall', 'lock',
		// Devices.
		'browser', 'desktop', 'laptop', 'mobile',
		// Notes / annotations.
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
