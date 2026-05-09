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

	/** Renders a temporary line/arrow segment between (from, to). */
	function showSegment(svg, kind, from, to) {
		const overlay = getOverlay(svg);
		if (!overlay) return;
		const line = ensureChild(overlay, SEGMENT_ID, () => {
			const node = document.createElementNS(Renderer.SVG_NS, 'line');
			node.setAttribute('stroke', C.DEFAULT_STROKE);
			node.setAttribute('stroke-width', String(C.DEFAULT_STROKE_WIDTH));
			node.setAttribute('stroke-dasharray', '4 3');
			return node;
		});
		if (kind === 'arrow') line.setAttribute('marker-end', 'url(#canvas-arrowhead)');
		else line.removeAttribute('marker-end');
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

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.EditorTempPreview = {
		showSegment,
		clearSegment,
		showFreehand,
		clearFreehand,
		showRect,
		clearRect,
	};
})();
