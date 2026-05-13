/* eslint-disable no-undef */
/**
 * Greedy word-wrap with character-level fallback for very long words.
 * Mirror of src/canvas/textWrap.ts so the in-app text rendering matches
 * the exported SVG character-by-character.
 *
 * Exposed as global `CanvasNotes.TextWrap`.
 */

(function () {
	'use strict';

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

	const SHAPE_LABEL_PADDING = 4;

	/**
	 * Computes positioning for a shape-embedded label. Mirror of
	 * layoutShapeLabel in src/canvas/textWrap.ts so the in-app view
	 * matches the exported SVG line by line.
	 */
	function layoutShapeLabel(text, box, fontSize, align, verticalAlign) {
		const innerW = Math.max(1, box.w - SHAPE_LABEL_PADDING * 2);
		const maxChars = charsPerWidth(innerW, fontSize);
		const lines = wrapByWidth(text, maxChars);
		const safeLines = lines.length > 0 ? lines : [''];

		const lineHeight = fontSize * TEXT_LINE_HEIGHT_RATIO;
		const totalHeight = safeLines.length * lineHeight;

		let textAnchor;
		let x;
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

		let firstBaselineY;
		if (verticalAlign === 'top') {
			firstBaselineY = box.y + SHAPE_LABEL_PADDING + fontSize;
		} else if (verticalAlign === 'bottom') {
			firstBaselineY = box.y + box.h - SHAPE_LABEL_PADDING - totalHeight + fontSize;
		} else {
			firstBaselineY = box.y + (box.h - totalHeight) / 2 + fontSize;
		}

		return { lines: safeLines, textAnchor, x, firstBaselineY };
	}

	/** Trims a title-like string to a visual character budget. */
	function clampTitle(title, max) {
		const t = String(title || '');
		if (t.length <= max) return t;
		return t.slice(0, Math.max(1, max - 1)) + '\u2026';
	}

	/**
	 * Trims a title-like string so it fits inside `width` pixels at the
	 * given fontSize. Mirror of clampTitleToWidth in canvas/textWrap.ts.
	 */
	function clampTitleToWidth(title, width, fontSize) {
		const max = charsPerWidth(width, fontSize);
		return clampTitle(title, Math.max(1, max));
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.TextWrap = {
		wrapByWidth,
		charsPerWidth,
		computeTextHeight,
		layoutShapeLabel,
		clampTitle,
		clampTitleToWidth,
		SHAPE_LABEL_PADDING,
		TEXT_LINE_HEIGHT_RATIO,
	};
})();
