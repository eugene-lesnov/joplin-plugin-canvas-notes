/* eslint-disable no-undef */
/**
 * Temporary preview overlay used while the user is drawing a new line,
 * arrow or freehand stroke. Lives on the selection layer so it always
 * paints on top of existing elements, and is cleared on pointer-up.
 *
 * Exposed as `window.CanvasNotes.EditorTempPreview`.
 */

(function () {
	'use strict';

	const C = window.CanvasNotes && window.CanvasNotes.EditorConstants;
	const Renderer = window.CanvasNotes && window.CanvasNotes.Renderer;

	const SEGMENT_ID = 'temp-segment';
	const PEN_ID = 'temp-pen';
	const RECT_ID = 'temp-rect';
	const SHAPE_ID = 'temp-shape';

	function getOverlay(svg) {
		return svg ? svg.querySelector('#selection-overlay') : null;
	}

	function ensureChild(overlay, id, factory) {
		let child = overlay.querySelector(`#${id}`);
		if (!child) {
			child = factory();
			child.setAttribute('id', id);
			overlay.appendChild(child);
		}
		return child;
	}

	function removeChild(overlay, id) {
		const child = overlay.querySelector(`#${id}`);
		if (child) overlay.removeChild(child);
	}

	/** Marker id for the given endpoint kind. Mirrors canvasRenderer.js. */
	function markerIdFor(kind, position) {
		if (!kind || kind === 'none') return null;
		if (kind === 'arrow') return position === 'end' ? 'canvas-arrowhead' : 'canvas-arrowhead-start';
		if (kind === 'triangle') return position === 'end' ? 'canvas-triangle' : 'canvas-triangle-start';
		if (kind === 'diamond-open') return position === 'end' ? 'canvas-diamond-open' : 'canvas-diamond-open-start';
		if (kind === 'diamond-filled') return position === 'end' ? 'canvas-diamond-filled' : 'canvas-diamond-filled-start';
		return null;
	}

	/**
	 * Renders a temporary line/arrow segment between (from, to). `spec`
	 * can be either a legacy string ('arrow' | 'line') or a full lineSpec
	 * object { type, strokeStyle, startArrow, endArrow }. The preview is
	 * always dashed for visual distinction from finalized lines.
	 */
	function showSegment(svg, spec, from, to) {
		const overlay = getOverlay(svg);
		if (!overlay) return;
		const line = ensureChild(overlay, SEGMENT_ID, () => {
			const node = document.createElementNS(Renderer.SVG_NS, 'line');
			node.setAttribute('stroke', C.DEFAULT_STROKE);
			node.setAttribute('stroke-width', String(C.DEFAULT_STROKE_WIDTH));
			node.setAttribute('stroke-dasharray', '4 3');
			return node;
		});

		const normalized = typeof spec === 'string'
			? { startArrow: 'none', endArrow: spec === 'arrow' ? 'arrow' : 'none' }
			: (spec || {});
		const endArrow = normalized.endArrow || 'none';
		const startArrow = normalized.startArrow || 'none';

		const endId = markerIdFor(endArrow, 'end');
		const startId = markerIdFor(startArrow, 'start');
		if (endId) line.setAttribute('marker-end', `url(#${endId})`);
		else line.removeAttribute('marker-end');
		if (startId) line.setAttribute('marker-start', `url(#${startId})`);
		else line.removeAttribute('marker-start');

		line.setAttribute('x1', String(from.x));
		line.setAttribute('y1', String(from.y));
		line.setAttribute('x2', String(to.x));
		line.setAttribute('y2', String(to.y));
	}

	function clearSegment(svg) {
		const overlay = getOverlay(svg);
		if (overlay) removeChild(overlay, SEGMENT_ID);
	}

	/** Renders a temporary freehand stroke through the given points. */
	function showFreehand(svg, points) {
		const overlay = getOverlay(svg);
		if (!overlay) return;
		const path = ensureChild(overlay, PEN_ID, () => {
			const node = document.createElementNS(Renderer.SVG_NS, 'path');
			node.setAttribute('fill', 'none');
			node.setAttribute('stroke', C.DEFAULT_STROKE);
			node.setAttribute('stroke-width', String(C.DEFAULT_STROKE_WIDTH));
			node.setAttribute('stroke-linecap', 'round');
			node.setAttribute('stroke-linejoin', 'round');
			return node;
		});
		let d = '';
		for (let i = 0; i < points.length; i++) {
			const p = points[i];
			d += (i === 0 ? 'M' : 'L') + p.x + ' ' + p.y + ' ';
		}
		path.setAttribute('d', d.trimEnd());
	}

	function clearFreehand(svg) {
		const overlay = getOverlay(svg);
		if (overlay) removeChild(overlay, PEN_ID);
	}

	/**
	 * Renders a dashed preview rectangle between two corner points.
	 * Used while the user is drag-creating a TextElement.
	 */
	function showRect(svg, from, to) {
		const overlay = getOverlay(svg);
		if (!overlay) return;
		const rect = ensureChild(overlay, RECT_ID, () => {
			const node = document.createElementNS(Renderer.SVG_NS, 'rect');
			node.setAttribute('fill', 'none');
			node.setAttribute('stroke', '#4a90e2');
			node.setAttribute('stroke-width', '1');
			node.setAttribute('stroke-dasharray', '4 3');
			node.setAttribute('pointer-events', 'none');
			return node;
		});
		const x = Math.min(from.x, to.x);
		const y = Math.min(from.y, to.y);
		const w = Math.abs(to.x - from.x);
		const h = Math.abs(to.y - from.y);
		rect.setAttribute('x', String(x));
		rect.setAttribute('y', String(y));
		rect.setAttribute('width', String(w));
		rect.setAttribute('height', String(h));
	}

	function clearRect(svg) {
		const overlay = getOverlay(svg);
		if (overlay) removeChild(overlay, RECT_ID);
	}

	/**
	 * Renders a dashed bounding-box preview of the shape being drag-created.
	 * The actual visual is determined at commit time by the tool's
	 * shapeType - the preview only conveys the bounds, which reads
	 * uniformly for every shape kind.
	 */
	function showShape(svg, from, to) {
		const overlay = getOverlay(svg);
		if (!overlay) return;
		const x = Math.min(from.x, to.x);
		const y = Math.min(from.y, to.y);
		const w = Math.abs(to.x - from.x);
		const h = Math.abs(to.y - from.y);

		let node = overlay.querySelector(`#${SHAPE_ID}`);
		if (!node) {
			node = document.createElementNS(Renderer.SVG_NS, 'rect');
			node.setAttribute('id', SHAPE_ID);
			node.setAttribute('fill', C.DEFAULT_FILL);
			node.setAttribute('fill-opacity', '0.5');
			node.setAttribute('stroke', C.DEFAULT_STROKE);
			node.setAttribute('stroke-width', String(C.DEFAULT_STROKE_WIDTH));
			node.setAttribute('stroke-dasharray', '4 3');
			node.setAttribute('pointer-events', 'none');
			overlay.appendChild(node);
		}
		node.setAttribute('x', String(x));
		node.setAttribute('y', String(y));
		node.setAttribute('width', String(w));
		node.setAttribute('height', String(h));
	}

	function clearShape(svg) {
		const overlay = getOverlay(svg);
		if (overlay) removeChild(overlay, SHAPE_ID);
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.EditorTempPreview = {
		showSegment,
		clearSegment,
		showFreehand,
		clearFreehand,
		showRect,
		clearRect,
		showShape,
		clearShape,
	};
})();
