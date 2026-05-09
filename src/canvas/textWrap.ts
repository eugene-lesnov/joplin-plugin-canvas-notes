/**
 * Greedy word-wrap with character-level fallback for very long words.
 *
 * Used for note/todo card body previews. The same algorithm is mirrored
 * (in JS) inside the webview renderer so the in-app preview matches the
 * exported SVG exactly.
 */

import { stripInvalidXmlChars } from './xmlEscape';

/** Trims a title-like string to a visual character budget. */
export function clampTitle(title: string, max: number): string {
	const t = stripInvalidXmlChars(title || '');
	if (t.length <= max) return t;
	return `${t.slice(0, Math.max(1, max - 1))}\u2026`;
}

/**
 * Wraps `text` into at most `maxLines` lines whose visible length never
 * exceeds `maxChars`. The last line is suffixed with an ellipsis when
 * the text overflows.
 */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
	const result: string[] = [];
	const words = text.split(/\s+/);
	let current = '';

	for (const word of words) {
		if (!word) continue;
		if (word.length > maxChars) {
			if (current) {
				result.push(current);
				current = '';
				if (result.length >= maxLines) break;
			}
			let rest = word;
			while (rest.length > maxChars && result.length < maxLines) {
				result.push(rest.slice(0, maxChars));
				rest = rest.slice(maxChars);
			}
			if (result.length >= maxLines) break;
			current = rest;
			continue;
		}
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length <= maxChars) {
			current = candidate;
		} else {
			result.push(current);
			if (result.length >= maxLines) break;
			current = word;
		}
	}

	if (result.length < maxLines && current) result.push(current);

	if (result.length === maxLines) {
		const joined = result.join(' ');
		if (joined.length < text.length) {
			const last = result[result.length - 1];
			const trimmed = last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last;
			result[result.length - 1] = `${trimmed.trimEnd()}\u2026`;
		}
	}
	return result;
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
 * Wraps `text` by character budget. Unlike wrapText() this variant:
 *   - preserves explicit newlines (split by \n) - each becomes a hard break;
 *   - keeps empty lines as empty entries (vertical spacing);
 *   - never truncates and never appends an ellipsis.
 *
 * Used by TextElement rendering on both the webview and serializer sides
 * so the in-app preview matches the exported SVG line by line.
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
