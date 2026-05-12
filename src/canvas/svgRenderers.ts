/**
 * Per-element SVG-string renderers for serializing a CanvasDocument.
 *
 * Each renderer produces a self-contained SVG fragment. Output is plain
 * markup (no JS, no foreignObject) so the SVG renders identically in
 * browsers, Inkscape, librsvg etc.
 */

import {
	ArrowElement,
	CanvasElement,
	CircleElement,
	EllipseElement,
	FreehandElement,
	LineElement,
	NoteCardElement,
	RectangleElement,
	ShapeElement,
	SquareElement,
	TextElement,
	TodoCardElement,
} from './canvasTypes';
import {
	ARROWHEAD_ID,
	ARROWHEAD_START_ID,
	CARD_BODY_FONT_SIZE,
	CARD_TITLE_FONT_SIZE,
	CARD_TITLE_HEIGHT,
	CARD_TITLE_MAX_CHARS,
	CARD_TITLE_PAD_X,
	MARKER_DIAMOND_FILLED_ID,
	MARKER_DIAMOND_FILLED_START_ID,
	MARKER_DIAMOND_OPEN_ID,
	MARKER_DIAMOND_OPEN_START_ID,
	MARKER_TRIANGLE_ID,
	MARKER_TRIANGLE_START_ID,
} from './svgConstants';
import { shapeDraw, ShapePiece } from './shapeGeometry';
import { charsPerWidth, clampTitle, TEXT_LINE_HEIGHT_RATIO, wrapByWidth, wrapText } from './textWrap';
import { formatNumber as num, safeText } from './xmlEscape';

const PREVIEW_LINE_HEIGHT = 14;
const PREVIEW_CHAR_WIDTH = 6;
const PREVIEW_MIN_CHARS = 8;

function renderRectangle(e: RectangleElement): string {
	const rx = e.rx !== undefined ? ` rx="${num(e.rx)}"` : '';
	return (
		`<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(e.w)}" height="${num(e.h)}"${rx}` +
		` fill="${safeText(e.fill)}" stroke="${safeText(e.stroke)}" stroke-width="${num(e.strokeWidth)}"/>`
	);
}

function renderSquare(e: SquareElement): string {
	const rx = e.rx !== undefined ? ` rx="${num(e.rx)}"` : '';
	return (
		`<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(e.size)}" height="${num(e.size)}"${rx}` +
		` fill="${safeText(e.fill)}" stroke="${safeText(e.stroke)}" stroke-width="${num(e.strokeWidth)}"/>`
	);
}

function renderCircle(e: CircleElement): string {
	return (
		`<circle cx="${num(e.cx)}" cy="${num(e.cy)}" r="${num(e.r)}"` +
		` fill="${safeText(e.fill)}" stroke="${safeText(e.stroke)}" stroke-width="${num(e.strokeWidth)}"/>`
	);
}

function renderEllipse(e: EllipseElement): string {
	return (
		`<ellipse cx="${num(e.cx)}" cy="${num(e.cy)}" rx="${num(e.rx)}" ry="${num(e.ry)}"` +
		` fill="${safeText(e.fill)}" stroke="${safeText(e.stroke)}" stroke-width="${num(e.strokeWidth)}"/>`
	);
}

/** Renders a single ShapePiece, using the shape's fill/stroke/sw. */
function renderShapePiece(p: ShapePiece, fill: string, stroke: string, sw: string): string {
	// `line` pieces never have a fill; everything else uses the shape's fill
	// unless explicitly overridden (e.g. divider rectangles inside a compound).
	const pieceFill = p.type === 'line' ? 'none'
		: ('fillOverride' in p && p.fillOverride === 'none' ? 'none' : fill);
	const style = ` fill="${pieceFill}" stroke="${stroke}" stroke-width="${sw}"`;
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
 * Renders any element of the unified shape model. Each ShapeKind is
 * dispatched to a primitive description from `shapeGeometry.ts`.
 * Negative width/height are gracefully handled because the geometry
 * helpers operate on the absolute bounds (renderer normalizes here).
 */
function renderShape(e: ShapeElement): string {
	const x = e.w >= 0 ? e.x : e.x + e.w;
	const y = e.h >= 0 ? e.y : e.y + e.h;
	const w = Math.abs(e.w);
	const h = Math.abs(e.h);
	const fill = safeText(e.fill);
	const stroke = safeText(e.stroke);
	const sw = num(e.strokeWidth);
	const style = ` fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`;

	const draw = shapeDraw(e.shapeType, { x, y, w, h });
	switch (draw.kind) {
		case 'polygon':
			return `<polygon points="${draw.points}"${style}/>`;
		case 'path':
			return `<path d="${draw.d}"${style}/>`;
		case 'rect':
			return `<rect x="${num(draw.x)}" y="${num(draw.y)}" width="${num(draw.w)}" height="${num(draw.h)}" rx="${num(draw.rx)}"${style}/>`;
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
			const pieces = draw.pieces.map((p) => renderShapePiece(p, fill, stroke, sw)).join('');
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
function renderLineLike(e: ArrowElement | LineElement): string {
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

	return (
		`<line x1="${num(e.from.x)}" y1="${num(e.from.y)}" x2="${num(e.to.x)}" y2="${num(e.to.y)}"` +
		` stroke="${safeText(e.stroke)}" stroke-width="${num(e.strokeWidth)}"` +
		`${linecap}${dashAttr}${markerStart}${markerEnd}/>`
	);
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

function cardTitleColor(e: NoteCardElement | TodoCardElement): string {
	if (e.broken) return '#b00020';
	if (e.type === 'todoCard') return e.completed ? '#7ab87a' : '#e2a64a';
	return '#4a90e2';
}

function renderPreviewLines(
	e: NoteCardElement | TodoCardElement,
	startY: number,
	maxLines: number,
): string {
	const padX = CARD_TITLE_PAD_X;
	const maxChars = Math.max(PREVIEW_MIN_CHARS, Math.floor((e.w - padX * 2) / PREVIEW_CHAR_WIDTH));
	const lines = wrapText(e.preview || '', maxChars, maxLines);
	if (lines.length === 0) return '';

	const spans = lines
		.map((line, idx) =>
			`<tspan x="${num(e.x + padX)}"${idx === 0 ? '' : ` dy="${PREVIEW_LINE_HEIGHT}"`}>${safeText(line)}</tspan>`,
		)
		.join('');
	return (
		`<text x="${num(e.x + padX)}" y="${num(startY)}"` +
		` font-size="${num(CARD_BODY_FONT_SIZE)}" font-family="sans-serif" fill="#666666">` +
		`${spans}</text>`
	);
}

function renderCard(e: NoteCardElement | TodoCardElement, statusLine: string | null): string {
	const titleY = e.y + CARD_TITLE_HEIGHT / 2 + CARD_TITLE_FONT_SIZE / 3;
	const titleColor = cardTitleColor(e);
	const broken = !!e.broken;

	const bodyRect = broken
		? `<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(e.w)}" height="${num(e.h)}"` +
		  ` rx="6" fill="#fff4f5" stroke="#b00020" stroke-width="1" stroke-dasharray="5 3"/>`
		: `<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(e.w)}" height="${num(e.h)}"` +
		  ` rx="6" fill="#ffffff" stroke="#cccccc" stroke-width="1"/>`;

	const titleRect =
		`<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(e.w)}" height="${num(CARD_TITLE_HEIGHT)}"` +
		` rx="6" fill="${titleColor}"/>`;

	const titleText =
		`<text x="${num(e.x + CARD_TITLE_PAD_X)}" y="${num(titleY)}"` +
		` font-size="${num(CARD_TITLE_FONT_SIZE)}" font-family="sans-serif" fill="#ffffff">` +
		`${safeText(clampTitle(e.title, CARD_TITLE_MAX_CHARS))}</text>`;

	let cursorY = e.y + CARD_TITLE_HEIGHT + PREVIEW_LINE_HEIGHT;
	const statusEl = statusLine
		? `<text x="${num(e.x + CARD_TITLE_PAD_X)}" y="${num(cursorY)}"` +
		  ` font-size="${num(CARD_BODY_FONT_SIZE)}" font-family="sans-serif" fill="#666666">` +
		  `${safeText(statusLine)}</text>`
		: '';
	if (statusLine) cursorY += 16;

	const footerSpace = broken ? 22 : 8;
	const availableHeight = e.y + e.h - cursorY - footerSpace;
	const maxLines = Math.max(0, Math.floor(availableHeight / PREVIEW_LINE_HEIGHT));
	const previewEl = e.preview && maxLines > 0
		? renderPreviewLines(e, cursorY, maxLines)
		: '';

	const brokenLabel = broken
		? `<text x="${num(e.x + CARD_TITLE_PAD_X)}" y="${num(e.y + e.h - 10)}"` +
		  ` font-size="11" font-family="sans-serif" fill="#b00020">broken link</text>`
		: '';

	return `<g>${bodyRect}${titleRect}${titleText}${statusEl}${previewEl}${brokenLabel}</g>`;
}

function renderNoteCard(e: NoteCardElement): string {
	return renderCard(e, e.broken ? `note (missing): ${e.noteId}` : null);
}

function renderTodoCard(e: TodoCardElement): string {
	const status = e.completed ? '[x] done' : '[ ] todo';
	return renderCard(e, status);
}

const TEXT_DEFAULT_FILL = '#222222';
const TEXT_DEFAULT_FONT_FAMILY = 'sans-serif';

/**
 * Renders a plain text element as <text> + <tspan> per visual line.
 *
 * Wrapping uses a character-budget heuristic from element.width and
 * fontSize, matching the webview side so the in-app preview lines up
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
export function renderElement(e: CanvasElement): string {
	switch (e.type) {
		case 'rectangle': return renderRectangle(e);
		case 'square':    return renderSquare(e);
		case 'circle':    return renderCircle(e);
		case 'ellipse':   return renderEllipse(e);
		case 'shape':     return renderShape(e);
		case 'arrow':     return renderLineLike(e);
		case 'line':      return renderLineLike(e);
		case 'freehand':  return renderFreehand(e);
		case 'noteCard':  return renderNoteCard(e);
		case 'todoCard':  return renderTodoCard(e);
		case 'text':      return renderText(e);
	}
}
