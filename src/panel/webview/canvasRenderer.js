/* eslint-disable no-undef */
/**
 * Canvas renderer for the WebView.
 *
 * Pure-DOM module. Has no knowledge of tools, selection logic or
 * messaging. Exposes itself via `window.CanvasNotes.Renderer`.
 *
 * Geometry must mirror src/canvas/svgSerializer.ts so the in-app view
 * stays visually identical to the saved SVG.
 *
 * Splits responsibilities between sibling helpers:
 *   - CanvasNotes.Geometry  - bbox, hit-test, distance helpers
 *   - CanvasNotes.Handles   - selection / canvas-resize handles
 *   - CanvasNotes.TextWrap  - greedy word-wrap for shape labels and text
 */

(function () {
	'use strict';

	const Geometry = window.CanvasNotes && window.CanvasNotes.Geometry;
	const Handles = window.CanvasNotes && window.CanvasNotes.Handles;
	const TextWrap = window.CanvasNotes && window.CanvasNotes.TextWrap;
	const ShapeGeometry = window.CanvasNotes && window.CanvasNotes.ShapeGeometry;
	const Types = window.CanvasNotes && window.CanvasNotes.Types;
	const isShapeType = (t) => !!(Types && Types.isShapeType && Types.isShapeType(t));

	function t(key, fallback) {
		const i18n = window.CanvasNotes && window.CanvasNotes.t;
		return typeof i18n === 'function' ? i18n(key) : fallback;
	}

	const SVG_NS = 'http://www.w3.org/2000/svg';
	const ARROWHEAD_ID = 'canvas-arrowhead';
	const ARROWHEAD_START_ID = 'canvas-arrowhead-start';
	const MARKER_TRIANGLE_ID = 'canvas-triangle';
	const MARKER_TRIANGLE_START_ID = 'canvas-triangle-start';
	const MARKER_DIAMOND_OPEN_ID = 'canvas-diamond-open';
	const MARKER_DIAMOND_OPEN_START_ID = 'canvas-diamond-open-start';
	const MARKER_DIAMOND_FILLED_ID = 'canvas-diamond-filled';
	const MARKER_DIAMOND_FILLED_START_ID = 'canvas-diamond-filled-start';
	const SELECTION_LAYER_ID = 'selection-overlay';
	const ELEMENTS_LAYER_ID = 'elements-layer';

	// Card geometry - keep in sync with src/canvas/svgConstants.ts
	const CARD_TITLE_HEIGHT = 28;
	const CARD_TITLE_PAD_X = 10;
	const CARD_TITLE_FONT_SIZE = 14;
	const CARD_BODY_PAD_Y = 10;
	const CARD_BODY_FONT_SIZE = 12;
	const CARD_TYPE_ICON_SIZE = 14;
	const CARD_TYPE_ICON_GAP = 6;
	const CARD_TAG_HEIGHT = 16;
	const CARD_TAG_PAD_X = 6;
	const CARD_TAG_GAP = 4;
	const CARD_TAG_FONT_SIZE = 11;
	const CARD_TAG_CHAR_WIDTH = 6; // approximate char width at CARD_TAG_FONT_SIZE

	// ---- defs / layers ----------------------------------------------------

	function arrowMarkerHtml(id) {
		return (
			`<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" ` +
			`markerWidth="8" markerHeight="8" orient="auto-start-reverse">` +
			`<path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker>`
		);
	}

	function triangleMarkerHtml(id) {
		return (
			`<marker id="${id}" viewBox="0 0 12 12" refX="11" refY="6" ` +
			`markerWidth="10" markerHeight="10" orient="auto-start-reverse">` +
			`<path d="M 0 0 L 11 6 L 0 12 z" fill="#ffffff" stroke="context-stroke" stroke-width="1.2"/></marker>`
		);
	}

	function diamondMarkerHtml(id, filled) {
		return (
			`<marker id="${id}" viewBox="0 0 16 10" refX="15" refY="5" ` +
			`markerWidth="12" markerHeight="10" orient="auto-start-reverse">` +
			`<path d="M 0 5 L 8 0 L 16 5 L 8 10 z" ` +
			`fill="${filled ? 'context-stroke' : '#ffffff'}" stroke="context-stroke" stroke-width="1.2"/></marker>`
		);
	}

	function buildDefs() {
		const defs = document.createElementNS(SVG_NS, 'defs');
		defs.innerHTML =
			arrowMarkerHtml(ARROWHEAD_ID) +
			arrowMarkerHtml(ARROWHEAD_START_ID) +
			triangleMarkerHtml(MARKER_TRIANGLE_ID) +
			triangleMarkerHtml(MARKER_TRIANGLE_START_ID) +
			diamondMarkerHtml(MARKER_DIAMOND_OPEN_ID, false) +
			diamondMarkerHtml(MARKER_DIAMOND_OPEN_START_ID, false) +
			diamondMarkerHtml(MARKER_DIAMOND_FILLED_ID, true) +
			diamondMarkerHtml(MARKER_DIAMOND_FILLED_START_ID, true);
		return defs;
	}

	/** Picks the SVG marker id for the given endpoint kind. */
	function markerIdFor(kind, position) {
		if (!kind || kind === 'none') return null;
		if (kind === 'arrow') return position === 'end' ? ARROWHEAD_ID : ARROWHEAD_START_ID;
		if (kind === 'triangle') return position === 'end' ? MARKER_TRIANGLE_ID : MARKER_TRIANGLE_START_ID;
		if (kind === 'diamond-open') return position === 'end' ? MARKER_DIAMOND_OPEN_ID : MARKER_DIAMOND_OPEN_START_ID;
		if (kind === 'diamond-filled') return position === 'end' ? MARKER_DIAMOND_FILLED_ID : MARKER_DIAMOND_FILLED_START_ID;
		return null;
	}

	// ---- attribute helpers ------------------------------------------------

	function setAttrs(node, attrs) {
		for (const [name, value] of Object.entries(attrs)) {
			node.setAttribute(name, String(value));
		}
		return node;
	}

	function el(name, attrs) {
		const node = document.createElementNS(SVG_NS, name);
		if (attrs) setAttrs(node, attrs);
		return node;
	}

	// ---- per-element renderers --------------------------------------------

	/**
	 * Stroke-dasharray pattern for a given line style. Mirrors
	 * `dashArrayFor` in src/canvas/svgRenderers.ts so the in-app and the
	 * exported SVG dashes look identical.
	 */
	function dashArrayFor(style, strokeWidth) {
		if (style === 'dashed') {
			const u = Math.max(2, strokeWidth * 3);
			return `${u} ${u * 0.6}`;
		}
		if (style === 'dotted') {
			const u = Math.max(1, strokeWidth);
			return `${u} ${u * 2}`;
		}
		return null;
	}

	/**
	 * Unified renderer for arrow/line elements. The visual is driven by
	 * `strokeStyle`, `startArrow`, `endArrow` rather than the type alone,
	 * so a single function handles solid/dashed/dotted and one-way /
	 * bidirectional / unmarked variants.
	 */
	function renderSegment(e, ctx) {
		const startArrow = e.startArrow || 'none';
		const endArrow = e.endArrow || (e.type === 'arrow' ? 'arrow' : 'none');
		const strokeStyle = e.strokeStyle || 'solid';

		const lineNode = el('line', {
			x1: e.from.x, y1: e.from.y,
			x2: e.to.x,   y2: e.to.y,
			stroke: e.stroke,
			'stroke-width': e.strokeWidth,
		});
		const endId = markerIdFor(endArrow, 'end');
		const startId = markerIdFor(startArrow, 'start');
		if (endId) lineNode.setAttribute('marker-end', `url(#${endId})`);
		if (startId) lineNode.setAttribute('marker-start', `url(#${startId})`);
		const dash = dashArrayFor(strokeStyle, e.strokeWidth);
		if (dash) lineNode.setAttribute('stroke-dasharray', dash);
		if (strokeStyle === 'solid') lineNode.setAttribute('stroke-linecap', 'round');

		const labelGroup = renderLineLabel(e, ctx);
		if (!labelGroup) return lineNode;
		const g = el('g');
		g.appendChild(lineNode);
		g.appendChild(labelGroup);
		return g;
	}

	// Inner padding around horizontal line-label text. Mirrors
	// LINE_LABEL_PAD_* in src/canvas/svgRenderers.ts.
	const LINE_LABEL_PAD_X = 4;
	const LINE_LABEL_PAD_Y = 2;
	const LINE_LABEL_CHAR_WIDTH_RATIO = 0.6;

	/** Endpoint padding so the label never overlaps the arrowhead. */
	function lineLabelEndPad(strokeWidth) {
		return Math.max(20, strokeWidth * 4);
	}

	/**
	 * Builds the line-label <g>. Dispatches on label.orientation:
	 *   'parallel'   - rotated above the line, length-wrapped;
	 *   'horizontal' - legacy: horizontal text + backdrop on the midpoint.
	 * Returns null when there is nothing to draw.
	 */
	function renderLineLabel(e, ctx) {
		const label = e.label;
		if (!label || !label.text) return null;

		const cx = (e.from.x + e.to.x) / 2;
		const cy = (e.from.y + e.to.y) / 2;
		const orientation = label.orientation || 'parallel';

		if (orientation === 'parallel') {
			return renderParallelLineLabel(e, cx, cy, label);
		}
		return renderHorizontalLineLabel(cx, cy, label, ctx);
	}

	/**
	 * Parallel mode: rotate text to follow the line, place above the
	 * stroke, word-wrap by the segment length.
	 */
	function renderParallelLineLabel(e, cx, cy, label) {
		const dx = e.to.x - e.from.x;
		const dy = e.to.y - e.from.y;
		const length = Math.hypot(dx, dy);
		if (length < 1) return null;

		let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
		if (angleDeg > 90) angleDeg -= 180;
		else if (angleDeg < -90) angleDeg += 180;

		const fontSize = label.fontSize;
		const lineHeight = fontSize * TextWrap.TEXT_LINE_HEIGHT_RATIO;
		const endPad = lineLabelEndPad(e.strokeWidth);
		const availableWidth = Math.max(1, length - endPad * 2);
		const maxChars = TextWrap.charsPerWidth(availableWidth, fontSize);
		const lines = TextWrap.wrapByWidth(label.text, maxChars);
		if (lines.length === 0) return null;

		const totalHeight = lines.length * lineHeight;
		const gap = Math.max(fontSize * 0.3, e.strokeWidth + 2);
		const firstBaselineY = -gap - totalHeight + fontSize;

		const g = el('g', {
			transform: `translate(${cx} ${cy}) rotate(${angleDeg})`,
			'pointer-events': 'none',
		});
		const text = el('text', {
			x: 0, y: firstBaselineY,
			'font-size': fontSize,
			'font-family': 'sans-serif',
			fill: label.color,
			'text-anchor': 'middle',
			'pointer-events': 'none',
			'data-line-label': '1',
		});
		lines.forEach((line, idx) => {
			const tspan = el('tspan', { x: 0 });
			if (idx > 0) tspan.setAttribute('dy', String(lineHeight));
			tspan.setAttribute('xml:space', 'preserve');
			tspan.textContent = line.length === 0 ? '\u200b' : line;
			text.appendChild(tspan);
		});
		g.appendChild(text);
		return g;
	}

	/**
	 * Horizontal mode: legacy text + backdrop centered on the midpoint.
	 * Used only when label.orientation === 'horizontal'.
	 */
	function renderHorizontalLineLabel(cx, cy, label, ctx) {
		const lines = String(label.text).split('\n');
		let longest = 0;
		for (const l of lines) if (l.length > longest) longest = l.length;
		const fontSize = label.fontSize;
		const lineHeight = fontSize * TextWrap.TEXT_LINE_HEIGHT_RATIO;
		const textWidth = Math.max(1, Math.ceil(longest * fontSize * LINE_LABEL_CHAR_WIDTH_RATIO));
		const textHeight = Math.ceil(lines.length * lineHeight);

		const rectW = textWidth + LINE_LABEL_PAD_X * 2;
		const rectH = textHeight + LINE_LABEL_PAD_Y * 2;
		const rectX = cx - rectW / 2;
		const rectY = cy - rectH / 2;
		const bg = (ctx && ctx.canvasBackground) ? ctx.canvasBackground : '#ffffff';

		const g = el('g');
		const backdrop = el('rect', {
			x: rectX, y: rectY, width: rectW, height: rectH,
			fill: bg, stroke: 'none',
			'pointer-events': 'none',
			'data-line-label-bg': '1',
		});
		g.appendChild(backdrop);

		const firstBaselineY = cy - textHeight / 2 + fontSize;
		const text = el('text', {
			x: cx, y: firstBaselineY,
			'font-size': fontSize,
			'font-family': 'sans-serif',
			fill: label.color,
			'text-anchor': 'middle',
			'pointer-events': 'none',
			'data-line-label': '1',
		});
		lines.forEach((line, idx) => {
			const tspan = el('tspan', { x: cx });
			if (idx > 0) tspan.setAttribute('dy', String(lineHeight));
			tspan.setAttribute('xml:space', 'preserve');
			tspan.textContent = line.length === 0 ? '\u200b' : line;
			text.appendChild(tspan);
		});
		g.appendChild(text);
		return g;
	}

	/**
	 * Renders a single ShapePiece into an SVG node.
	 * Style overrides on the piece:
	 *   fillOverride === 'none' - stroke-only piece (no fill);
	 *   noStroke                - filled piece without an outline;
	 *   strokeWidthMul          - multiplier on the base stroke width.
	 */
	function renderShapePiece(p, e) {
		const pieceFill = p.type === 'line' ? 'none'
			: (p.fillOverride === 'none' ? 'none' : e.fill);
		const pieceStroke = p.noStroke ? 'none' : e.stroke;
		const pieceSw = e.strokeWidth * (p.strokeWidthMul || 1);
		const common = { fill: pieceFill, stroke: pieceStroke, 'stroke-width': pieceSw };
		switch (p.type) {
			case 'rect': {
				const attrs = Object.assign({ x: p.x, y: p.y, width: p.w, height: p.h }, common);
				if (p.rx !== undefined) attrs.rx = p.rx;
				return el('rect', attrs);
			}
			case 'ellipse':
				return el('ellipse', Object.assign({ cx: p.cx, cy: p.cy, rx: p.rx, ry: p.ry }, common));
			case 'circle':
				return el('circle', Object.assign({ cx: p.cx, cy: p.cy, r: p.r }, common));
			case 'polygon':
				return el('polygon', Object.assign({ points: p.points }, common));
			case 'path':
				return el('path', Object.assign({ d: p.d }, common));
			case 'line':
				return el('line', Object.assign({ x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 }, common));
		}
		return null;
	}

	/**
	 * Renders a unified shape element. Dispatches through ShapeGeometry
	 * for the actual primitive description.
	 */
	function renderShape(e) {
		if (!ShapeGeometry) return null;
		// Normalize negative width/height (transient during drag-create)
		// so the geometry helpers always see a positive box.
		const x = e.w >= 0 ? e.x : e.x + e.w;
		const y = e.h >= 0 ? e.y : e.y + e.h;
		const w = Math.abs(e.w);
		const h = Math.abs(e.h);
		const draw = ShapeGeometry.shapeDraw(e.type, { x, y, w, h });
		if (!draw) return null;

		const applyStyle = (node) => {
			node.setAttribute('fill', e.fill);
			node.setAttribute('stroke', e.stroke);
			node.setAttribute('stroke-width', String(e.strokeWidth));
		};

		if (draw.kind === 'polygon') {
			const node = el('polygon', { points: draw.points });
			applyStyle(node);
			return node;
		}
		if (draw.kind === 'path') {
			const node = el('path', { d: draw.d });
			applyStyle(node);
			return node;
		}
		if (draw.kind === 'rect') {
			const node = el('rect', { x: draw.x, y: draw.y, width: draw.w, height: draw.h, rx: draw.rx });
			applyStyle(node);
			return node;
		}
		if (draw.kind === 'cylinder') {
			const g = el('g');
			const body = el('path', { d: draw.body });
			applyStyle(body);
			g.appendChild(body);
			const rim = el('ellipse', {
				cx: draw.top.cx, cy: draw.top.cy, rx: draw.top.rx, ry: draw.top.ry,
				fill: 'none', stroke: e.stroke, 'stroke-width': e.strokeWidth,
			});
			g.appendChild(rim);
			return g;
		}
		if (draw.kind === 'compound') {
			const g = el('g');
			for (const piece of draw.pieces) {
				const node = renderShapePiece(piece, e);
				if (node) g.appendChild(node);
			}
			return g;
		}
		return null;
	}

	function freehandPathData(points) {
		if (!points || !points.length) return '';
		let d = '';
		for (let i = 0; i < points.length; i++) {
			const p = points[i];
			d += (i === 0 ? 'M' : 'L') + p.x + ' ' + p.y + ' ';
		}
		return d.trimEnd();
	}

	function renderFreehand(e) {
		return el('path', {
			d: freehandPathData(e.points),
			fill: 'none',
			stroke: e.stroke,
			'stroke-width': e.strokeWidth,
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
		});
	}

	function cardTitleColor(e) {
		if (e.broken) return '#b00020';
		if (e.type === 'todoCard') return e.completed ? '#7ab87a' : '#e2a64a';
		return '#4a90e2';
	}

	function renderCard(e) {
		const g = el('g');

		const body = el('rect', {
			x: e.x, y: e.y, width: e.w, height: e.h, rx: 6,
			fill: e.broken ? '#fff4f5' : '#ffffff',
			stroke: e.broken ? '#b00020' : '#cccccc',
			'stroke-width': 1,
		});
		if (e.broken) body.setAttribute('stroke-dasharray', '5 3');
		g.appendChild(body);

		g.appendChild(el('rect', {
			x: e.x, y: e.y, width: e.w, height: CARD_TITLE_HEIGHT, rx: 6,
			fill: cardTitleColor(e),
		}));

		const title = el('text', {
			x: e.x + CARD_TITLE_PAD_X,
			y: e.y + CARD_TITLE_HEIGHT / 2 + 5,
			'font-size': CARD_TITLE_FONT_SIZE,
			'font-family': 'sans-serif',
			fill: '#ffffff',
			'data-card-title': '1',
		});
		const rawTitle = e.title || t('cardUntitled', '(untitled)');
		const titleWidth = Math.max(1, e.w - CARD_TITLE_PAD_X * 2);
		title.textContent = TextWrap.clampTitleToWidth
			? TextWrap.clampTitleToWidth(rawTitle, titleWidth, CARD_TITLE_FONT_SIZE)
			: rawTitle;
		g.appendChild(title);

		appendCardBody(g, e);

		if (e.broken) {
			const note = el('text', {
				x: e.x + CARD_TITLE_PAD_X, y: e.y + e.h - 10,
				'font-size': 11, 'font-family': 'sans-serif', fill: '#b00020',
			});
			note.textContent = t('cardBrokenLink', 'broken link');
			g.appendChild(note);
		}

		return g;
	}

	/**
	 * Renders the card body: type icon, localized type label and tag chips.
	 * The type label is placed on the first row right after the icon; tags
	 * flow into one or more rows below. A trailing "+N" chip is added when
	 * not all tags fit horizontally.
	 */
	function appendCardBody(g, e) {
		const color = cardTitleColor(e);
		const bodyTop = e.y + CARD_TITLE_HEIGHT + CARD_BODY_PAD_Y;
		const leftX = e.x + CARD_TITLE_PAD_X;

		// Defensive guard: if the card is shorter than what's required for
		// one body row, skip the body entirely so it does not draw over the
		// title bar. Same check happens in the SVG serializer.
		const typeRowBottom = bodyTop + CARD_TYPE_ICON_SIZE;
		if (typeRowBottom > e.y + e.h) return;
		// Same guard horizontally: if the body cannot fit at least the icon
		// plus a one-character label, skip the body.
		if (e.w < CARD_TITLE_PAD_X * 2 + CARD_TYPE_ICON_SIZE + CARD_TYPE_ICON_GAP) return;

		appendTypeIcon(g, e, leftX, bodyTop, color);
		const labelText = cardTypeLabel(e);
		const labelX = leftX + CARD_TYPE_ICON_SIZE + CARD_TYPE_ICON_GAP;
		const labelBaselineY = bodyTop + CARD_TYPE_ICON_SIZE - 2;
		const label = el('text', {
			x: labelX, y: labelBaselineY,
			'font-size': CARD_BODY_FONT_SIZE,
			'font-family': 'sans-serif',
			fill: '#444444',
		});
		label.textContent = labelText;
		g.appendChild(label);

		const tags = Array.isArray(e.tags) ? e.tags : [];
		if (tags.length === 0) return;

		const tagsTop = bodyTop + CARD_TYPE_ICON_SIZE + 6;
		appendTagChips(g, e, tags, leftX, tagsTop, color);
	}

	/** Returns the localized type label for the card. */
	function cardTypeLabel(e) {
		if (e.type === 'todoCard') {
			return e.completed
				? t('cardTypeTaskDone', 'Task (done)')
				: t('cardTypeTask', 'Task');
		}
		return t('cardTypeNote', 'Note');
	}

	/**
	 * Draws a small icon at (x, y) that visually distinguishes notes from
	 * tasks. Tasks also reflect their completion state (filled box with
	 * checkmark when done, empty box otherwise).
	 */
	function appendTypeIcon(g, e, x, y, color) {
		const size = CARD_TYPE_ICON_SIZE;
		if (e.type === 'todoCard') {
			g.appendChild(el('rect', {
				x, y, width: size, height: size, rx: 2,
				fill: e.completed ? color : '#ffffff',
				stroke: color, 'stroke-width': 1.5,
			}));
			if (e.completed) {
				const check = el('path', {
					d: `M${x + 3} ${y + size / 2} L${x + size / 2 - 1} ${y + size - 4} L${x + size - 3} ${y + 3}`,
					fill: 'none', stroke: '#ffffff',
					'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
				});
				g.appendChild(check);
			}
			return;
		}
		// Note icon: document with a folded corner.
		const fold = 4;
		const d = (
			`M${x} ${y} ` +
			`L${x + size - fold} ${y} ` +
			`L${x + size} ${y + fold} ` +
			`L${x + size} ${y + size} ` +
			`L${x} ${y + size} Z ` +
			`M${x + size - fold} ${y} L${x + size - fold} ${y + fold} L${x + size} ${y + fold}`
		);
		g.appendChild(el('path', {
			d, fill: '#ffffff', stroke: color, 'stroke-width': 1.5,
			'stroke-linejoin': 'round',
		}));
	}

	/**
	 * Flow-lays tag chips horizontally with wrap to a new row. Stops when
	 * vertical space runs out and appends a "+N" overflow chip.
	 */
	function appendTagChips(g, e, tags, startX, startY, color) {
		const maxRight = e.x + e.w - CARD_TITLE_PAD_X;
		const maxBottom = e.y + e.h - (e.broken ? 22 : CARD_BODY_PAD_Y);
		let rowX = startX;
		let rowY = startY;
		let rendered = 0;

		for (let i = 0; i < tags.length; i++) {
			const label = `#${tags[i]}`;
			const chipW = estimateChipWidth(label);
			const remaining = tags.length - i;
			// Reserve space for a "+N" chip if more tags follow.
			const reserveW = remaining > 1 ? estimateChipWidth(`+${remaining - 1}`) + CARD_TAG_GAP : 0;

			if (rowX + chipW > maxRight) {
				rowX = startX;
				rowY += CARD_TAG_HEIGHT + CARD_TAG_GAP;
			}
			if (rowY + CARD_TAG_HEIGHT > maxBottom) {
				renderOverflowChip(g, rowX, rowY - CARD_TAG_HEIGHT - CARD_TAG_GAP, tags.length - rendered, color);
				return;
			}
			// If this chip plus the reserved overflow chip would not fit on
			// the current row, and there is no room for a new row, stop early.
			if (rowX + chipW + reserveW > maxRight && rowY + CARD_TAG_HEIGHT * 2 + CARD_TAG_GAP > maxBottom) {
				renderOverflowChip(g, rowX, rowY, tags.length - rendered, color);
				return;
			}

			renderChip(g, rowX, rowY, chipW, label, color);
			rowX += chipW + CARD_TAG_GAP;
			rendered += 1;
		}
	}

	function estimateChipWidth(label) {
		return CARD_TAG_PAD_X * 2 + Math.max(1, label.length) * CARD_TAG_CHAR_WIDTH;
	}

	function renderChip(g, x, y, w, text, color) {
		g.appendChild(el('rect', {
			x, y, width: w, height: CARD_TAG_HEIGHT, rx: 8,
			fill: color, 'fill-opacity': 0.12,
			stroke: color, 'stroke-opacity': 0.4, 'stroke-width': 1,
		}));
		const label = el('text', {
			x: x + w / 2, y: y + CARD_TAG_HEIGHT - 4,
			'font-size': CARD_TAG_FONT_SIZE,
			'font-family': 'sans-serif',
			'text-anchor': 'middle',
			fill: '#333333',
		});
		label.textContent = text;
		g.appendChild(label);
	}

	function renderOverflowChip(g, x, y, count, color) {
		const text = `+${count}`;
		const w = estimateChipWidth(text);
		renderChip(g, x, y, w, text, color);
	}

	/**
	 * Renders a plain text element with greedy word wrap by element.width.
	 * Empty text is not rendered. Long single tokens are broken at the
	 * character boundary. Empty lines stay as vertical spacers.
	 */
	function renderText(e) {
		if (!e.text) return null;
		const fontSize = e.fontSize || 16;
		const lineHeight = fontSize * 1.2;
		const baselineY = e.y + fontSize;

		const text = el('text', {
			x: e.x,
			y: baselineY,
			'font-size': fontSize,
			'font-family': 'sans-serif',
			fill: '#222222',
		});

		const maxChars = TextWrap.charsPerWidth(e.width, fontSize);
		const lines = TextWrap.wrapByWidth(e.text, maxChars);
		lines.forEach((line, idx) => {
			const tspan = el('tspan', { x: e.x });
			if (idx > 0) tspan.setAttribute('dy', String(lineHeight));
			tspan.setAttribute('xml:space', 'preserve');
			// SVG hides empty <tspan> entirely (no vertical advance), so use a
			// zero-width space to force a real empty line.
			tspan.textContent = line.length === 0 ? '\u200b' : line;
			text.appendChild(tspan);
		});
		return text;
	}

	/**
	 * Returns the box used to position an embedded shape label.
	 * Negative width/height boxes are normalized so labels render
	 * correctly while the user is drag-resizing into the opposite
	 * quadrant.
	 */
	function labelBoxFor(e) {
		if (!isShapeType(e.type)) return null;
		const x = e.w >= 0 ? e.x : e.x + e.w;
		const y = e.h >= 0 ? e.y : e.y + e.h;
		return { x, y, w: Math.abs(e.w), h: Math.abs(e.h) };
	}

	/**
	 * Builds the SVG <text> node for an embedded shape label. Returns
	 * null when there is nothing to draw. pointer-events="none" makes
	 * the label transparent to clicks so the shape under it stays
	 * selectable.
	 */
	function renderShapeLabel(e) {
		const label = e.label;
		if (!label || !label.text) return null;
		const box = labelBoxFor(e);
		if (!box || box.w <= 0 || box.h <= 0) return null;

		const layout = TextWrap.layoutShapeLabel(
			label.text, box, label.fontSize,
			label.align, label.verticalAlign,
		);
		const lineHeight = label.fontSize * TextWrap.TEXT_LINE_HEIGHT_RATIO;

		const text = el('text', {
			x: layout.x,
			y: layout.firstBaselineY,
			'font-size': label.fontSize,
			'font-family': 'sans-serif',
			fill: label.color,
			'text-anchor': layout.textAnchor,
			'pointer-events': 'none',
			// Marks the label sub-node so the editor can hide only the
			// label (not the whole shape) while the textarea overlay is open.
			'data-shape-label': '1',
		});
		layout.lines.forEach((line, idx) => {
			const tspan = el('tspan', { x: layout.x });
			if (idx > 0) tspan.setAttribute('dy', String(lineHeight));
			tspan.setAttribute('xml:space', 'preserve');
			// Empty <tspan> collapses vertically; force a glyph for blank lines.
			tspan.textContent = line.length === 0 ? '\u200b' : line;
			text.appendChild(tspan);
		});
		return text;
	}

	/** Wraps shape node + optional label into a <g>. */
	function withLabel(shapeNode, e) {
		if (!shapeNode) return null;
		const label = renderShapeLabel(e);
		if (!label) return shapeNode;
		const g = el('g');
		g.appendChild(shapeNode);
		g.appendChild(label);
		return g;
	}

	function renderElement(e, ctx) {
		if (isShapeType(e.type)) return withLabel(renderShape(e), e);
		switch (e.type) {
			case 'arrow':
			case 'line':      return renderSegment(e, ctx);
			case 'freehand':  return renderFreehand(e);
			case 'noteCard':
			case 'todoCard':  return renderCard(e);
			case 'text':      return renderText(e);
			default:          return null;
		}
	}

	// ---- public entry: render full document -------------------------------

	/**
	 * Replaces the SVG content with elements rendered from the document.
	 * Each rendered node receives `data-element-id`. Selection lives in a
	 * separate top-most layer so it can be redrawn cheaply.
	 */
	function renderDocument(svg, doc, selectedId) {
		while (svg.firstChild) svg.removeChild(svg.firstChild);

		setAttrs(svg, {
			viewBox: `0 0 ${doc.width} ${doc.height}`,
			width: doc.width,
			height: doc.height,
		});

		svg.appendChild(buildDefs());

		const bg = el('rect', {
			x: 0, y: 0,
			width: doc.width, height: doc.height,
			fill: doc.background || '#ffffff',
			'data-canvas-bg': '1',
		});
		svg.appendChild(bg);

		const layer = el('g', { id: ELEMENTS_LAYER_ID });
		svg.appendChild(layer);

		const ctx = { canvasBackground: doc.background || '#ffffff' };
		const sorted = (doc.elements || []).slice().sort((a, b) => a.z - b.z);
		for (const item of sorted) {
			const node = renderElement(item, ctx);
			if (!node) continue;
			node.setAttribute('data-element-id', item.id);
			layer.appendChild(node);
		}

		const overlay = el('g', { id: SELECTION_LAYER_ID });
		svg.appendChild(overlay);

		drawSelection(svg, doc, selectedId);
	}

	/** Repaints the selection overlay only; full render is not required. */
	function drawSelection(svg, doc, selectedId) {
		const overlay = svg.querySelector(`#${SELECTION_LAYER_ID}`);
		if (!overlay) return;
		while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

		drawCanvasHandles(overlay, doc);

		if (!selectedId) return;
		const item = (doc.elements || []).find((e) => e.id === selectedId);
		if (!item) return;

		// Outline (skip for thin lines/arrows where it looks bad).
		const isThin = item.type === 'arrow' || item.type === 'line';
		if (!isThin) {
			const b = Geometry.elementBBox(item);
			if (item.type === 'freehand' && (b.w === 0 || b.h === 0)) {
				// freehand can collapse to a single point; just skip the outline.
			} else {
				const pad = item.type === 'freehand' ? 4 : 0;
				overlay.appendChild(el('rect', {
					x: b.x - pad, y: b.y - pad,
					width: b.w + pad * 2, height: b.h + pad * 2,
					class: 'selection-outline',
				}));
			}
		}

		drawElementHandles(overlay, item);
	}

	function drawElementHandles(overlay, item) {
		const handles = Handles.getElementHandles(item);
		const size = Handles.HANDLE_SIZE;
		for (const h of handles) {
			const sq = el('rect', {
				x: h.x - size / 2, y: h.y - size / 2,
				width: size, height: size,
				class: 'selection-handle',
				'data-handle': h.name,
				style: `cursor:${h.cursor}`,
			});
			overlay.appendChild(sq);
		}
	}

	function drawCanvasHandles(overlay, doc) {
		const items = Handles.getCanvasHandles(doc);
		const size = Handles.HANDLE_SIZE;
		for (const h of items) {
			const sq = el('rect', {
				x: h.x - size / 2, y: h.y - size / 2,
				width: size, height: size,
				class: 'canvas-handle',
				'data-canvas-handle': h.name,
				style: `cursor:${h.cursor}`,
			});
			overlay.appendChild(sq);
		}
	}

	/**
	 * Measures the rendered bbox of the SVG node for the given element id.
	 * Returns {x, y, w, h} in document space, or null on missing/zero-sized
	 * nodes. Useful for pixel-perfect post-render adjustments.
	 */
	function measureElementBBox(svgRoot, elementId) {
		if (!svgRoot || !elementId) return null;
		const target = svgRoot.querySelector(
			`[data-element-id="${String(elementId).replace(/[\"\\]/g, '\\$&')}"]`,
		);
		if (!target || typeof target.getBBox !== 'function') return null;
		try {
			const b = target.getBBox();
			if (!b || !Number.isFinite(b.width) || !Number.isFinite(b.height)) return null;
			return { x: b.x, y: b.y, w: b.width, h: b.height };
		} catch (_) {
			return null;
		}
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.Renderer = {
		SVG_NS,
		renderDocument,
		drawSelection,
		// Geometry helpers re-exported for backwards compatibility with
		// existing canvasEditor.js callers.
		elementBBox: Geometry ? Geometry.elementBBox : null,
		hitTest: Geometry ? Geometry.hitTest : null,
		pickHandleAt: Handles ? Handles.pickElementHandleAt : null,
		pickCanvasHandleAt: Handles ? Handles.pickCanvasHandleAt : null,
		measureElementBBox,
	};
})();
