/**
 * Greedy word-wrap with character-level fallback for very long words.
 *
 * The same algorithm is mirrored (in JS) inside the webview renderer so
 * the in-app text rendering matches the exported SVG exactly.
 */

import { stripInvalidXmlChars } from './xmlEscape';

/** Trims a title-like string to a visual character budget. */
export function clampTitle(title: string, max: number): string {
	const t = stripInvalidXmlChars(title || '');
	if (t.length <= max) return t;
	return `${t.slice(0, Math.max(1, max - 1))}\u2026`;
}

/**
 * Trims a title-like string so it fits inside `width` pixels at the
 * given fontSize. Uses the same character-budget heuristic as the rest
 * of the layout pipeline (charsPerWidth), so the in-app view and the
 * exported SVG always agree.
 */
export function clampTitleToWidth(title: string, width: number, fontSize: number): string {
	const max = charsPerWidth(width, fontSize);
	return clampTitle(title, Math.max(1, max));
}

/**
 * Wraps a single visual line (no explicit newlines) to fit within
 * `maxChars` characters per line. Greedy word-wrap; words longer than
 * `maxChars` are broken at character boundaries. Empty input produces an
 * empty array.
 */
function wrapSingleLine(line: string, maxChars: number): string[] {
	if (maxChars < 1) return [line];
	const out: string[] = [];
	const words = line.split(/ +/);
	let current = '';
	for (const word of words) {
		if (word.length > maxChars) {
			if (current) { out.push(current); current = ''; }
			let rest = word;
			while (rest.length > maxChars) {
				out.push(rest.slice(0, maxChars));
				rest = rest.slice(maxChars);
			}
			current = rest;
			continue;
		}
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length <= maxChars) {
			current = candidate;
		} else {
			out.push(current);
			current = word;
		}
	}
	if (current) out.push(current);
	return out;
}

/**
 * Wraps `text` by character budget:
 *   - preserves explicit newlines (split by \n) - each becomes a hard break;
 *   - keeps empty lines as empty entries (vertical spacing);
 *   - never truncates and never appends an ellipsis.
 *
 * Used by TextElement and embedded label rendering on both the webview
 * and serializer sides so the in-app view matches the exported SVG.
 */
export function wrapByWidth(text: string, maxChars: number): string[] {
	if (!text) return [];
	const safeMax = maxChars < 1 ? 1 : maxChars;
	const result: string[] = [];
	const hardLines = text.split('\n');
	for (const line of hardLines) {
		if (line.length === 0) {
			result.push('');
			continue;
		}
		const wrapped = wrapSingleLine(line, safeMax);
		if (wrapped.length === 0) {
			result.push('');
		} else {
			for (const w of wrapped) result.push(w);
		}
	}
	return result;
}

/**
 * Average glyph width estimate used for px <-> chars conversion. Matches
 * the heuristic used by the renderer; intentionally generous so wrapping
 * is slightly conservative (line ends a tad earlier than strictly fits).
 */
const AVG_CHAR_WIDTH_RATIO = 0.6;

/** Converts a pixel width budget to a character budget for `fontSize`. */
export function charsPerWidth(width: number, fontSize: number): number {
	if (!Number.isFinite(width) || !Number.isFinite(fontSize) || fontSize <= 0) return 1;
	return Math.max(1, Math.floor(width / (fontSize * AVG_CHAR_WIDTH_RATIO)));
}

/** Line-height ratio shared by renderer and serializer. */
export const TEXT_LINE_HEIGHT_RATIO = 1.2;

/**
 * Computes the pixel height needed to fit `text` inside `width` at the
 * given fontSize, using the same wrap algorithm both renderers use.
 * Always returns at least one line of height so auto-sized empty boxes
 * stay clickable.
 */
export function computeTextHeight(text: string, width: number, fontSize: number): number {
	const lineHeight = fontSize * TEXT_LINE_HEIGHT_RATIO;
	if (!text) return Math.ceil(lineHeight);
	const maxChars = charsPerWidth(width, fontSize);
	const lines = wrapByWidth(text, maxChars);
	const count = Math.max(1, lines.length);
	return Math.ceil(count * lineHeight);
}

/** Horizontal padding for shape labels. */
export const SHAPE_LABEL_PADDING = 4;

/** Gap between a shape's bottom edge and its external label. */
export const SHAPE_LABEL_EXTERNAL_GAP = 6;

/**
 * Computes positioning for a shape label below the shape box. Returns
 * wrapped lines, the SVG text-anchor value, the x anchor and the
 * baseline y of the FIRST line. `verticalAlign` is kept in the signature
 * for backward compatibility with persisted label settings, but shape
 * labels are now always laid out externally below the figure.
 *
 * Sharing this helper between the webview renderer and the SVG
 * serializer keeps the in-app view and exported SVG visually identical.
 */
export function layoutShapeLabel(
	text: string,
	box: { x: number; y: number; w: number; h: number },
	fontSize: number,
	align: 'left' | 'center' | 'right',
	_verticalAlign: 'top' | 'middle' | 'bottom',
): { lines: string[]; textAnchor: 'start' | 'middle' | 'end'; x: number; firstBaselineY: number } {
	const labelW = Math.max(1, box.w - SHAPE_LABEL_PADDING * 2);
	const maxChars = charsPerWidth(labelW, fontSize);
	const lines = wrapByWidth(text, maxChars);
	const safeLines = lines.length > 0 ? lines : [''];

	let textAnchor: 'start' | 'middle' | 'end';
	let x: number;
	if (align === 'left') {
		textAnchor = 'start';
		x = box.x + SHAPE_LABEL_PADDING;
	} else if (align === 'right') {
		textAnchor = 'end';
		x = box.x + box.w - SHAPE_LABEL_PADDING;
	} else {
		textAnchor = 'middle';
		x = box.x + box.w / 2;
	}

	const firstBaselineY = box.y + box.h + SHAPE_LABEL_EXTERNAL_GAP + fontSize;
	return { lines: safeLines, textAnchor, x, firstBaselineY };
}
