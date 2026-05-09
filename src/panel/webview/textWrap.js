/* eslint-disable no-undef */
/**
 * Greedy word-wrap with character-level fallback for very long words.
 * Mirror of src/canvas/textWrap.ts so the in-app preview matches the
 * exported SVG character-by-character.
 *
 * Exposed as global `CanvasNotes.TextWrap`.
 */

(function () {
	'use strict';

	function wrapText(text, maxChars, maxLines) {
		const result = [];
		const words = (text || '').split(/\s+/);
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
			if (joined.length < (text || '').length) {
				const last = result[result.length - 1];
				const trimmed = last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last;
				result[result.length - 1] = `${trimmed.trimEnd()}\u2026`;
			}
		}
		return result;
	}

	// Greedy single-line wrap without ellipsis. Used by TextElement
	// rendering where overflow visually flows past the box rather than
	// being truncated.
	function wrapSingleLine(line, maxChars) {
		if (maxChars < 1) return [line];
		const out = [];
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
			const candidate = current ? (current + ' ' + word) : word;
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
	 * TextElement word wrap: hard-breaks on '\n', keeps empty lines as
	 * vertical spacers, never truncates. Mirror of src/canvas/textWrap.ts.
	 */
	function wrapByWidth(text, maxChars) {
		if (!text) return [];
		const safeMax = maxChars < 1 ? 1 : maxChars;
		const result = [];
		const hardLines = String(text).split('\n');
		for (const line of hardLines) {
			if (line.length === 0) { result.push(''); continue; }
			const wrapped = wrapSingleLine(line, safeMax);
			if (wrapped.length === 0) result.push('');
			else for (const w of wrapped) result.push(w);
		}
		return result;
	}

	const AVG_CHAR_WIDTH_RATIO = 0.6;
	const TEXT_LINE_HEIGHT_RATIO = 1.2;

	function charsPerWidth(width, fontSize) {
		if (!Number.isFinite(width) || !Number.isFinite(fontSize) || fontSize <= 0) return 1;
		return Math.max(1, Math.floor(width / (fontSize * AVG_CHAR_WIDTH_RATIO)));
	}

	/**
	 * Mirrors src/canvas/textWrap.ts computeTextHeight so both sides agree
	 * on the auto-sized height of a TextElement.
	 */
	function computeTextHeight(text, width, fontSize) {
		const lineHeight = fontSize * TEXT_LINE_HEIGHT_RATIO;
		if (!text) return Math.ceil(lineHeight);
		const maxChars = charsPerWidth(width, fontSize);
		const lines = wrapByWidth(text, maxChars);
		const count = Math.max(1, lines.length);
		return Math.ceil(count * lineHeight);
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.TextWrap = {
		wrapText,
		wrapByWidth,
		charsPerWidth,
		computeTextHeight,
		TEXT_LINE_HEIGHT_RATIO,
	};
})();
