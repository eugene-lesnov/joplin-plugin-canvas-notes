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
	SquareElement,
	TextElement,
	TodoCardElement,
} from './canvasTypes';
import {
	ARROWHEAD_ID,
	CARD_BODY_FONT_SIZE,
	CARD_TITLE_FONT_SIZE,
	CARD_TITLE_HEIGHT,
	CARD_TITLE_MAX_CHARS,
	CARD_TITLE_PAD_X,
} from './svgConstants';
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

function renderArrow(e: ArrowElement): string {
	return (
		`<line x1="${num(e.from.x)}" y1="${num(e.from.y)}" x2="${num(e.to.x)}" y2="${num(e.to.y)}"` +
		` stroke="${safeText(e.stroke)}" stroke-width="${num(e.strokeWidth)}"` +
		` marker-end="url(#${ARROWHEAD_ID})"/>`
	);
}

function renderLine(e: LineElement): string {
	return (
		`<line x1="${num(e.from.x)}" y1="${num(e.from.y)}" x2="${num(e.to.x)}" y2="${num(e.to.y)}"` +
		` stroke="${safeText(e.stroke)}" stroke-width="${num(e.strokeWidth)}"` +
		` stroke-linecap="round"/>`
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
		case 'arrow':     return renderArrow(e);
		case 'line':      return renderLine(e);
		case 'freehand':  return renderFreehand(e);
		case 'noteCard':  return renderNoteCard(e);
		case 'todoCard':  return renderTodoCard(e);
		case 'text':      return renderText(e);
	}
}
