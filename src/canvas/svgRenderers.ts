/**
 * Per-element SVG-string renderers for serializing a CanvasDocument.
 *
 * Each renderer produces a self-contained SVG fragment. Output is plain
 * markup (no JS, no foreignObject) so the SVG renders identically in
 * browsers, Inkscape, librsvg etc.
 */

import {
	ArrowElement,
	BoxElement,
	CanvasElement,
	FreehandElement,
	isShapeType,
	LineElement,
	NoteCardElement,
	TextElement,
	TodoCardElement,
} from './canvasTypes';
import {
	ARROWHEAD_ID,
	ARROWHEAD_START_ID,
	CARD_BODY_FONT_SIZE,
	CARD_TITLE_FONT_SIZE,
	CARD_TITLE_HEIGHT,
	CARD_TITLE_PAD_X,
	MARKER_DIAMOND_FILLED_ID,
	MARKER_DIAMOND_FILLED_START_ID,
	MARKER_DIAMOND_OPEN_ID,
	MARKER_DIAMOND_OPEN_START_ID,
	MARKER_TRIANGLE_ID,
	MARKER_TRIANGLE_START_ID,
} from './svgConstants';
import { shapeDraw, ShapePiece } from './shapeGeometry';
import {
	charsPerWidth,
	clampTitleToWidth,
	layoutShapeLabel,
	TEXT_LINE_HEIGHT_RATIO,
	wrapByWidth,
} from './textWrap';
import { formatNumber as num, safeText } from './xmlEscape';
import strings from '../i18n/localization';

/**
 * Per-render context shared between dispatchers and individual element
 * renderers. Currently used for line labels that need the canvas
 * background color for their backdrop, but kept open for future
 * cross-cutting concerns (theme tokens, render-time flags, etc.).
 */
export interface RenderContext {
	canvasBackground: string;
}

const DEFAULT_RENDER_CONTEXT: RenderContext = { canvasBackground: '#ffffff' };

/**
 * Card body geometry constants. Mirror canvasRenderer.js so the exported
 * SVG and the in-app view line up pixel-for-pixel.
 */
const CARD_BODY_PAD_Y = 10;
const CARD_TYPE_ICON_SIZE = 14;
const CARD_TYPE_ICON_GAP = 6;
const CARD_TAG_HEIGHT = 16;
const CARD_TAG_PAD_X = 6;
const CARD_TAG_GAP = 4;
const CARD_TAG_FONT_SIZE = 11;
const CARD_TAG_CHAR_WIDTH = 6;

/**
 * Computes the bounding box used for label layout. Negative
 * width/height (transient during drag-create) are normalized.
 */
function labelBoxFor(e: BoxElement): { x: number; y: number; w: number; h: number } {
	const x = e.w >= 0 ? e.x : e.x + e.w;
	const y = e.h >= 0 ? e.y : e.y + e.h;
	return { x, y, w: Math.abs(e.w), h: Math.abs(e.h) };
}

/**
 * Renders the embedded label as an SVG <text> with one <tspan> per
 * visual line. Returns an empty string when there is nothing to draw.
 *
 * pointer-events="none" guarantees the label never intercepts clicks
 * when the SVG is viewed in an interactive context.
 */
function renderShapeLabel(e: BoxElement): string {
	const label = e.label;
	if (!label || !label.text) return '';
	const box = labelBoxFor(e);
	if (box.w <= 0 || box.h <= 0) return '';

	const layout = layoutShapeLabel(label.text, box, label.fontSize, label.align, label.verticalAlign);
	const lineHeight = label.fontSize * TEXT_LINE_HEIGHT_RATIO;

	const spans = layout.lines
		.map((line, idx) => {
			const dy = idx === 0 ? '' : ` dy="${num(lineHeight)}"`;
			const content = line.length === 0 ? '\u200b' : safeText(line);
			return `<tspan x="${num(layout.x)}"${dy} xml:space="preserve">${content}</tspan>`;
		})
		.join('');

	return (
		`<text x="${num(layout.x)}" y="${num(layout.firstBaselineY)}"` +
		` font-size="${num(label.fontSize)}" font-family="sans-serif"` +
		` fill="${safeText(label.color)}" text-anchor="${layout.textAnchor}"` +
		` pointer-events="none">${spans}</text>`
	);
}

/** Wraps a shape fragment with its optional label into a <g>. */
function withLabel(shapeFragment: string, e: BoxElement): string {
	const label = renderShapeLabel(e);
	if (!label) return shapeFragment;
	return `<g>${shapeFragment}${label}</g>`;
}

/**
 * Renders a single ShapePiece, using the shape's fill/stroke/sw.
 * Style overrides on the piece:
 *   - fillOverride === 'none' : draw with no fill;
 *   - noStroke                : draw with the shape's fill but no stroke;
 *   - strokeWidthMul          : multiply the base stroke width.
 */
function renderShapePiece(p: ShapePiece, fill: string, stroke: string, strokeWidth: number): string {
	// `line` pieces never have a fill; everything else uses the shape's fill
	// unless explicitly overridden.
	const pieceFill = p.type === 'line' ? 'none'
		: (p.fillOverride === 'none' ? 'none' : fill);
	const pieceStroke = p.noStroke ? 'none' : stroke;
	const pieceSw = num(strokeWidth * (p.strokeWidthMul || 1));
	const style = ` fill="${pieceFill}" stroke="${pieceStroke}" stroke-width="${pieceSw}"`;
	switch (p.type) {
		case 'rect': {
			const rx = p.rx !== undefined ? ` rx="${num(p.rx)}"` : '';
			return `<rect x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w)}" height="${num(p.h)}"${rx}${style}/>`;
		}
		case 'ellipse':
			return `<ellipse cx="${num(p.cx)}" cy="${num(p.cy)}" rx="${num(p.rx)}" ry="${num(p.ry)}"${style}/>`;
		case 'circle':
			return `<circle cx="${num(p.cx)}" cy="${num(p.cy)}" r="${num(p.r)}"${style}/>`;
		case 'polygon':
			return `<polygon points="${p.points}"${style}/>`;
		case 'path':
			return `<path d="${p.d}"${style}/>`;
		case 'line':
			return `<line x1="${num(p.x1)}" y1="${num(p.y1)}" x2="${num(p.x2)}" y2="${num(p.y2)}"${style}/>`;
	}
}

/**
 * Renders any element of the unified shape model. Each ShapeType is
 * dispatched to a primitive description from `shapeGeometry.ts`.
 * Negative width/height are gracefully handled because the geometry
 * helpers operate on the absolute bounds (renderer normalizes here).
 */
function renderShape(e: BoxElement): string {
	const x = e.w >= 0 ? e.x : e.x + e.w;
	const y = e.h >= 0 ? e.y : e.y + e.h;
	const w = Math.abs(e.w);
	const h = Math.abs(e.h);
	const fill = safeText(e.fill);
	const stroke = safeText(e.stroke);
	const sw = num(e.strokeWidth);
	const style = ` fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`;

	const draw = shapeDraw(e.type, { x, y, w, h });
	switch (draw.kind) {
		case 'polygon':
			return `<polygon points="${draw.points}"${style}/>`;
		case 'path':
			return `<path d="${draw.d}"${style}/>`;
		case 'rect': {
			// rx=0 case is the plain rectangle; omit the attribute for
			// cleaner SVG output.
			const rxAttr = draw.rx > 0 ? ` rx="${num(draw.rx)}"` : '';
			return `<rect x="${num(draw.x)}" y="${num(draw.y)}" width="${num(draw.w)}" height="${num(draw.h)}"${rxAttr}${style}/>`;
		}
		case 'cylinder': {
			// Cylinder: filled body + visible top rim (stroked only).
			const body = `<path d="${draw.body}"${style}/>`;
			const top = draw.top;
			const rim =
				`<ellipse cx="${num(top.cx)}" cy="${num(top.cy)}" rx="${num(top.rx)}" ry="${num(top.ry)}"` +
				` fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
			return `<g>${body}${rim}</g>`;
		}
		case 'compound': {
			const pieces = draw.pieces.map((p) => renderShapePiece(p, fill, stroke, e.strokeWidth)).join('');
			return `<g>${pieces}</g>`;
		}
	}
}

/**
 * Stroke-dasharray pattern for a given line style. Scaled by stroke
 * width so the visual rhythm stays consistent across thin and thick
 * strokes. Returns null for solid (default) so the attribute is omitted.
 */
function dashArrayFor(style: 'solid' | 'dashed' | 'dotted', strokeWidth: number): string | null {
	if (style === 'dashed') {
		const u = Math.max(2, strokeWidth * 3);
		return `${num(u)} ${num(u * 0.6)}`;
	}
	if (style === 'dotted') {
		const u = Math.max(1, strokeWidth);
		return `${num(u)} ${num(u * 2)}`;
	}
	return null;
}

/**
 * Maps an arrowhead kind to the SVG marker id for the matching end of the
 * line. Returns null when no marker is needed.
 */
function markerIdFor(kind: 'none' | 'arrow' | 'triangle' | 'diamond-open' | 'diamond-filled',
                    position: 'start' | 'end'): string | null {
	if (kind === 'none') return null;
	if (kind === 'arrow') return position === 'end' ? ARROWHEAD_ID : ARROWHEAD_START_ID;
	if (kind === 'triangle') return position === 'end' ? MARKER_TRIANGLE_ID : MARKER_TRIANGLE_START_ID;
	if (kind === 'diamond-open') return position === 'end' ? MARKER_DIAMOND_OPEN_ID : MARKER_DIAMOND_OPEN_START_ID;
	if (kind === 'diamond-filled') return position === 'end' ? MARKER_DIAMOND_FILLED_ID : MARKER_DIAMOND_FILLED_START_ID;
	return null;
}

/**
 * Unified renderer for arrow/line elements. The visual is fully driven
 * by `strokeStyle`, `startArrow`, `endArrow` rather than the legacy
 * type discriminator, so a single function covers solid/dashed/dotted
 * and one-way / bidirectional / UML-style variants.
 */
function renderLineLike(e: ArrowElement | LineElement, ctx: RenderContext): string {
	const startArrow = e.startArrow ?? 'none';
	const endArrow = e.endArrow ?? (e.type === 'arrow' ? 'arrow' : 'none');
	const strokeStyle = e.strokeStyle ?? 'solid';

	const startId = markerIdFor(startArrow, 'start');
	const endId = markerIdFor(endArrow, 'end');
	const markerStart = startId ? ` marker-start="url(#${startId})"` : '';
	const markerEnd = endId ? ` marker-end="url(#${endId})"` : '';
	const dash = dashArrayFor(strokeStyle, e.strokeWidth);
	const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
	// Round caps look great for solid lines but make dotted patterns merge
	// into a single dash; use default (butt) caps for dashed/dotted.
	const linecap = strokeStyle === 'solid' ? ' stroke-linecap="round"' : '';

	const lineFragment =
		`<line x1="${num(e.from.x)}" y1="${num(e.from.y)}" x2="${num(e.to.x)}" y2="${num(e.to.y)}"` +
		` stroke="${safeText(e.stroke)}" stroke-width="${num(e.strokeWidth)}"` +
		`${linecap}${dashAttr}${markerStart}${markerEnd}/>`;

	const labelFragment = renderLineLabel(e, ctx);
	if (!labelFragment) return lineFragment;
	return `<g>${lineFragment}${labelFragment}</g>`;
}

/** Horizontal/vertical padding around line label text, in document units. */
const LINE_LABEL_PAD_X = 4;
const LINE_LABEL_PAD_Y = 2;

/**
 * Space (in document units) reserved at each end of the line so the
 * label text never overlaps the arrowhead. Scales with strokeWidth to
 * handle thick lines.
 */
function lineLabelEndPad(strokeWidth: number): number {
	return Math.max(20, strokeWidth * 4);
}

/**
 * Renders the embedded line label. Returns an empty string when there
 * is nothing to draw.
 *
 * Two orientation modes:
 *  - 'parallel':   text rotates to follow the line, sits above it,
 *                  word-wrapped by the available segment length so
 *                  long captions break into multiple lines instead of
 *                  overflowing the endpoints.
 *  - 'horizontal': legacy mode, text stays horizontal with a backdrop
 *                  rect over the midpoint.
 */
function renderLineLabel(e: ArrowElement | LineElement, ctx: RenderContext): string {
	const label = e.label;
	if (!label || !label.text) return '';

	const cx = (e.from.x + e.to.x) / 2;
	const cy = (e.from.y + e.to.y) / 2;
	const orientation = label.orientation ?? 'parallel';

	if (orientation === 'parallel') {
		return renderParallelLineLabel(e, cx, cy, label);
	}
	return renderHorizontalLineLabel(cx, cy, label, ctx);
}

/**
 * Parallel orientation: text follows the line direction, above the
 * stroke, word-wrapped by the segment length.
 */
function renderParallelLineLabel(
	e: ArrowElement | LineElement,
	cx: number, cy: number,
	label: NonNullable<(ArrowElement | LineElement)['label']>,
): string {
	const dx = e.to.x - e.from.x;
	const dy = e.to.y - e.from.y;
	const length = Math.hypot(dx, dy);
	// Degenerate (zero-length) segment: nothing meaningful to label.
	if (length < 1) return '';

	// Upright flip: clamp angle to [-90, 90] so text is never upside down.
	let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
	if (angleDeg > 90) angleDeg -= 180;
	else if (angleDeg < -90) angleDeg += 180;

	const fontSize = label.fontSize;
	const lineHeight = fontSize * TEXT_LINE_HEIGHT_RATIO;

	// Word-wrap by available width along the segment, reserving space for
	// arrowheads on both ends. The same wrapByWidth/charsPerWidth helpers
	// the shape labels and TextElement use, so behavior is consistent.
	const endPad = lineLabelEndPad(e.strokeWidth);
	const availableWidth = Math.max(1, length - endPad * 2);
	const maxChars = charsPerWidth(availableWidth, fontSize);
	const lines = wrapByWidth(label.text, maxChars);
	if (lines.length === 0) return '';

	const totalHeight = lines.length * lineHeight;
	// Gap between the line and the bottom of the text block. Scales with
	// strokeWidth so the text does not touch thick strokes.
	const gap = Math.max(fontSize * 0.3, e.strokeWidth + 2);
	// First baseline so the WHOLE block sits above the line in the local
	// (translated+rotated) coordinate system: bottom edge of the block at
	// y = -gap, top edge at y = -gap - totalHeight, first baseline at
	// y = -gap - totalHeight + fontSize.
	const firstBaselineY = -gap - totalHeight + fontSize;

	const spans = lines
		.map((line, idx) => {
			const dyAttr = idx === 0 ? '' : ` dy="${num(lineHeight)}"`;
			const content = line.length === 0 ? '\u200b' : safeText(line);
			return `<tspan x="0"${dyAttr} xml:space="preserve">${content}</tspan>`;
		})
		.join('');

	const text =
		`<text x="0" y="${num(firstBaselineY)}"` +
		` font-size="${num(fontSize)}" font-family="sans-serif"` +
		` fill="${safeText(label.color)}" text-anchor="middle"` +
		` pointer-events="none">${spans}</text>`;

	return (
		`<g transform="translate(${num(cx)} ${num(cy)}) rotate(${num(angleDeg)})"` +
		` pointer-events="none">${text}</g>`
	);
}

/**
 * Legacy horizontal orientation: text + backdrop centered on midpoint,
 * no rotation, no length-based wrap. Kept for users who explicitly
 * choose 'horizontal' in the model.
 */
function renderHorizontalLineLabel(
	cx: number, cy: number,
	label: NonNullable<(ArrowElement | LineElement)['label']>,
	ctx: RenderContext,
): string {
	const lines = label.text.split('\n');
	const longest = lines.reduce((m, l) => (l.length > m ? l.length : m), 0);
	const fontSize = label.fontSize;
	const textWidth = Math.max(1, Math.ceil(longest * fontSize * 0.6));
	const lineHeight = fontSize * TEXT_LINE_HEIGHT_RATIO;
	const textHeight = Math.ceil(lines.length * lineHeight);

	const rectW = textWidth + LINE_LABEL_PAD_X * 2;
	const rectH = textHeight + LINE_LABEL_PAD_Y * 2;
	const rectX = cx - rectW / 2;
	const rectY = cy - rectH / 2;

	const backdrop =
		`<rect x="${num(rectX)}" y="${num(rectY)}" width="${num(rectW)}" height="${num(rectH)}"` +
		` fill="${safeText(ctx.canvasBackground)}" stroke="none" pointer-events="none"/>`;

	const firstBaselineY = cy - textHeight / 2 + fontSize;
	const spans = lines
		.map((line, idx) => {
			const dy = idx === 0 ? '' : ` dy="${num(lineHeight)}"`;
			const content = line.length === 0 ? '\u200b' : safeText(line);
			return `<tspan x="${num(cx)}"${dy} xml:space="preserve">${content}</tspan>`;
		})
		.join('');

	const text =
		`<text x="${num(cx)}" y="${num(firstBaselineY)}"` +
		` font-size="${num(fontSize)}" font-family="sans-serif"` +
		` fill="${safeText(label.color)}" text-anchor="middle"` +
		` pointer-events="none">${spans}</text>`;

	return backdrop + text;
}

function renderFreehand(e: FreehandElement): string {
	if (!e.points.length) return '';
	const d = e.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p.x)} ${num(p.y)}`).join(' ');
	return (
		`<path d="${d}"` +
		` fill="none" stroke="${safeText(e.stroke)}" stroke-width="${num(e.strokeWidth)}"` +
		` stroke-linecap="round" stroke-linejoin="round"/>`
	);
}

/**
 * A card is "unreachable" when its linked note is either missing or in
 * the trash. Both states share the same muted style; only the bottom
 * status label differs.
 */
function isCardUnreachable(e: NoteCardElement | TodoCardElement): boolean {
	return !!(e.broken || e.trashed);
}

function cardTitleColor(e: NoteCardElement | TodoCardElement): string {
	if (isCardUnreachable(e)) return '#b00020';
	if (e.type === 'todoCard') return e.completed ? '#7ab87a' : '#e2a64a';
	return '#4a90e2';
}

function renderCard(e: NoteCardElement | TodoCardElement): string {
	const titleY = e.y + CARD_TITLE_HEIGHT / 2 + CARD_TITLE_FONT_SIZE / 3;
	const titleColor = cardTitleColor(e);
	const unreachable = isCardUnreachable(e);

	const bodyRect = unreachable
		? `<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(e.w)}" height="${num(e.h)}"` +
		  ` rx="6" fill="#fff4f5" stroke="#b00020" stroke-width="1" stroke-dasharray="5 3"/>`
		: `<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(e.w)}" height="${num(e.h)}"` +
		  ` rx="6" fill="#ffffff" stroke="#cccccc" stroke-width="1"/>`;

	const titleRect =
		`<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(e.w)}" height="${num(CARD_TITLE_HEIGHT)}"` +
		` rx="6" fill="${titleColor}"/>`;

	const titleInnerW = Math.max(1, e.w - CARD_TITLE_PAD_X * 2);
	const titleText =
		`<text x="${num(e.x + CARD_TITLE_PAD_X)}" y="${num(titleY)}"` +
		` font-size="${num(CARD_TITLE_FONT_SIZE)}" font-family="sans-serif" fill="#ffffff">` +
		`${safeText(clampTitleToWidth(e.title, titleInnerW, CARD_TITLE_FONT_SIZE))}</text>`;

	const body = renderCardBody(e, titleColor);

	const statusLabel = unreachable
		? `<text x="${num(e.x + CARD_TITLE_PAD_X)}" y="${num(e.y + e.h - 10)}"` +
		  ` font-size="11" font-family="sans-serif" fill="#b00020">` +
		  `${safeText(e.trashed ? strings.cardTrashed : strings.cardBrokenLink)}</text>`
		: '';

	return `<g>${bodyRect}${titleRect}${titleText}${body}${statusLabel}</g>`;
}

function renderNoteCard(e: NoteCardElement): string {
	return renderCard(e);
}

function renderTodoCard(e: TodoCardElement): string {
	return renderCard(e);
}

/**
 * Renders the card body: type icon, localized type label and tag chips.
 * Mirrors appendCardBody in src/panel/webview/canvasRenderer.js so the
 * exported SVG matches the in-app view pixel-for-pixel.
 */
function renderCardBody(e: NoteCardElement | TodoCardElement, color: string): string {
	const bodyTop = e.y + CARD_TITLE_HEIGHT + CARD_BODY_PAD_Y;
	const leftX = e.x + CARD_TITLE_PAD_X;

	// Defensive guard: skip the body when the card is too small to fit it
	// without overlapping the title bar. Mirrors appendCardBody in the
	// webview renderer.
	if (bodyTop + CARD_TYPE_ICON_SIZE > e.y + e.h) return '';
	if (e.w < CARD_TITLE_PAD_X * 2 + CARD_TYPE_ICON_SIZE + CARD_TYPE_ICON_GAP) return '';

	const icon = renderTypeIcon(e, leftX, bodyTop, color);

	const labelText = cardTypeLabel(e);
	const labelX = leftX + CARD_TYPE_ICON_SIZE + CARD_TYPE_ICON_GAP;
	const labelBaselineY = bodyTop + CARD_TYPE_ICON_SIZE - 2;
	const label =
		`<text x="${num(labelX)}" y="${num(labelBaselineY)}"` +
		` font-size="${num(CARD_BODY_FONT_SIZE)}" font-family="sans-serif" fill="#444444">` +
		`${safeText(labelText)}</text>`;

	const tags = Array.isArray(e.tags) ? e.tags : [];
	const tagsTop = bodyTop + CARD_TYPE_ICON_SIZE + 6;
	const tagsMarkup = tags.length > 0 ? renderTagChips(e, tags, leftX, tagsTop, color) : '';

	return `${icon}${label}${tagsMarkup}`;
}

function cardTypeLabel(e: NoteCardElement | TodoCardElement): string {
	if (e.type === 'todoCard') {
		return e.completed ? strings.cardTypeTaskDone : strings.cardTypeTask;
	}
	return strings.cardTypeNote;
}

function renderTypeIcon(
	e: NoteCardElement | TodoCardElement,
	x: number,
	y: number,
	color: string,
): string {
	const size = CARD_TYPE_ICON_SIZE;
	if (e.type === 'todoCard') {
		const fill = e.completed ? color : '#ffffff';
		const rect =
			`<rect x="${num(x)}" y="${num(y)}" width="${num(size)}" height="${num(size)}"` +
			` rx="2" fill="${fill}" stroke="${color}" stroke-width="1.5"/>`;
		if (!e.completed) return rect;
		const check =
			`<path d="M${num(x + 3)} ${num(y + size / 2)} L${num(x + size / 2 - 1)} ${num(y + size - 4)} L${num(x + size - 3)} ${num(y + 3)}"` +
			` fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
		return `${rect}${check}`;
	}
	const fold = 4;
	const d = (
		`M${num(x)} ${num(y)} ` +
		`L${num(x + size - fold)} ${num(y)} ` +
		`L${num(x + size)} ${num(y + fold)} ` +
		`L${num(x + size)} ${num(y + size)} ` +
		`L${num(x)} ${num(y + size)} Z ` +
		`M${num(x + size - fold)} ${num(y)} L${num(x + size - fold)} ${num(y + fold)} L${num(x + size)} ${num(y + fold)}`
	);
	return (
		`<path d="${d}" fill="#ffffff" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`
	);
}

function renderTagChips(
	e: NoteCardElement | TodoCardElement,
	tags: string[],
	startX: number,
	startY: number,
	color: string,
): string {
	const maxRight = e.x + e.w - CARD_TITLE_PAD_X;
	const maxBottom = e.y + e.h - (isCardUnreachable(e) ? 22 : CARD_BODY_PAD_Y);
	let rowX = startX;
	let rowY = startY;
	let rendered = 0;
	const parts: string[] = [];

	for (let i = 0; i < tags.length; i++) {
		const label = `#${tags[i]}`;
		const chipW = estimateChipWidth(label);
		const remaining = tags.length - i;
		const reserveW = remaining > 1 ? estimateChipWidth(`+${remaining - 1}`) + CARD_TAG_GAP : 0;

		if (rowX + chipW > maxRight) {
			rowX = startX;
			rowY += CARD_TAG_HEIGHT + CARD_TAG_GAP;
		}
		if (rowY + CARD_TAG_HEIGHT > maxBottom) {
			parts.push(
				renderChip(rowX, rowY - CARD_TAG_HEIGHT - CARD_TAG_GAP, `+${tags.length - rendered}`, color),
			);
			return parts.join('');
		}
		if (rowX + chipW + reserveW > maxRight && rowY + CARD_TAG_HEIGHT * 2 + CARD_TAG_GAP > maxBottom) {
			parts.push(renderChip(rowX, rowY, `+${tags.length - rendered}`, color));
			return parts.join('');
		}

		parts.push(renderChip(rowX, rowY, label, color));
		rowX += chipW + CARD_TAG_GAP;
		rendered += 1;
	}
	return parts.join('');
}

function estimateChipWidth(label: string): number {
	return CARD_TAG_PAD_X * 2 + Math.max(1, label.length) * CARD_TAG_CHAR_WIDTH;
}

function renderChip(x: number, y: number, text: string, color: string): string {
	const w = estimateChipWidth(text);
	const rect =
		`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(CARD_TAG_HEIGHT)}"` +
		` rx="8" fill="${color}" fill-opacity="0.12"` +
		` stroke="${color}" stroke-opacity="0.4" stroke-width="1"/>`;
	const label =
		`<text x="${num(x + w / 2)}" y="${num(y + CARD_TAG_HEIGHT - 4)}"` +
		` font-size="${num(CARD_TAG_FONT_SIZE)}" font-family="sans-serif"` +
		` text-anchor="middle" fill="#333333">${safeText(text)}</text>`;
	return `${rect}${label}`;
}

const TEXT_DEFAULT_FILL = '#222222';
const TEXT_DEFAULT_FONT_FAMILY = 'sans-serif';

/**
 * Renders a plain text element as <text> + <tspan> per visual line.
 *
 * Wrapping uses a character-budget heuristic from element.width and
 * fontSize, matching the webview side so the in-app view lines up
 * with the exported SVG. Empty input produces no output.
 */
function renderText(e: TextElement): string {
	if (!e.text) return '';
	const fontSize = e.fontSize;
	const lineHeight = fontSize * TEXT_LINE_HEIGHT_RATIO;
	const baselineY = e.y + fontSize;

	const maxChars = charsPerWidth(e.width, fontSize);
	const lines = wrapByWidth(e.text, maxChars);
	const spans = lines
		.map((line, idx) => {
			const dy = idx === 0 ? '' : ` dy="${num(lineHeight)}"`;
			// Empty lines need a zero-width space so the line still advances.
			const content = line.length === 0 ? '\u200b' : safeText(line);
			return `<tspan x="${num(e.x)}"${dy} xml:space="preserve">${content}</tspan>`;
		})
		.join('');

	return (
		`<text x="${num(e.x)}" y="${num(baselineY)}"` +
		` font-size="${num(fontSize)}" font-family="${TEXT_DEFAULT_FONT_FAMILY}"` +
		` fill="${TEXT_DEFAULT_FILL}">${spans}</text>`
	);
}

/** Dispatcher: returns the SVG fragment for any supported element. */
export function renderElement(e: CanvasElement, ctx: RenderContext = DEFAULT_RENDER_CONTEXT): string {
	if (isShapeType(e.type)) {
		return withLabel(renderShape(e as BoxElement), e as BoxElement);
	}
	switch (e.type) {
		case 'arrow':     return renderLineLike(e, ctx);
		case 'line':      return renderLineLike(e, ctx);
		case 'freehand':  return renderFreehand(e);
		case 'noteCard':  return renderNoteCard(e);
		case 'todoCard':  return renderTodoCard(e);
		case 'text':      return renderText(e);
	}
}
