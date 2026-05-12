/**
 * Geometric helpers for canvas elements.
 *
 * All functions are pure and operate on the discriminated CanvasElement
 * union. Used by the SVG serializer for viewBox computation; the webview
 * renderer ships its own mirror because TS modules cannot be loaded
 * directly into Joplin's webview context.
 */

import { CanvasDocument, CanvasElement } from './canvasTypes';
import { MIN_CANVAS_DIMENSION, VIEWBOX_PADDING } from './svgConstants';

export interface Bounds {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Axis-aligned bounding box of a single element in document space. */
export function elementBounds(e: CanvasElement): Bounds {
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
			return { x, y, w: Math.abs(e.to.x - e.from.x), h: Math.abs(e.to.y - e.from.y) };
		}
		case 'freehand': {
			let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
			for (const p of e.points) {
				if (p.x < minX) minX = p.x;
				if (p.y < minY) minY = p.y;
				if (p.x > maxX) maxX = p.x;
				if (p.y > maxY) maxY = p.y;
			}
			return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
		}
		case 'noteCard':
		case 'todoCard':
			return { x: e.x, y: e.y, w: e.w, h: e.h };
		case 'text':
			return { x: e.x, y: e.y, w: e.width, h: e.height };
	}
}

/**
 * Computes the SVG viewBox: starts from (0, 0, doc.width, doc.height),
 * but expands to include any elements that were placed outside.
 *
 * Without this, elements outside the declared canvas size are invisible
 * when the SVG is opened in a browser or imported into other tools.
 */
export function effectiveViewBounds(doc: CanvasDocument): Bounds {
	let minX = 0;
	let minY = 0;
	let maxX = Math.max(MIN_CANVAS_DIMENSION, doc.width);
	let maxY = Math.max(MIN_CANVAS_DIMENSION, doc.height);

	for (const el of doc.elements) {
		const b = elementBounds(el);
		if (b.x < minX) minX = b.x;
		if (b.y < minY) minY = b.y;
		if (b.x + b.w > maxX) maxX = b.x + b.w;
		if (b.y + b.h > maxY) maxY = b.y + b.h;
	}

	const pad = VIEWBOX_PADDING;
	return {
		x: minX - pad,
		y: minY - pad,
		w: (maxX - minX) + pad * 2,
		h: (maxY - minY) + pad * 2,
	};
}
