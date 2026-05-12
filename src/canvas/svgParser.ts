/**
 * Parses a CanvasDocument out of an SVG string.
 *
 * Geometry of the SVG is intentionally NOT parsed back. The single source
 * of truth is the JSON payload inside
 *
 *   <metadata id="joplin-canvas-data"><![CDATA[ ...JSON... ]]></metadata>
 *
 * Implementation uses regex extraction (no DOMParser) so it works
 * uniformly in Node and inside the Joplin webview sandbox.
 */

import { assertCanvasDocument } from './canvasModel';
import { CanvasDocument } from './canvasTypes';
import { CANVAS_METADATA_ID } from './svgConstants';
import { unescapeXml } from './xmlEscape';

// Defaults applied to text elements during load when fields are missing
// (e.g. older documents created before the field set was finalized).
const TEXT_DEFAULT_X = 0;
const TEXT_DEFAULT_Y = 0;
const TEXT_DEFAULT_WIDTH = 200;
const TEXT_DEFAULT_HEIGHT = 80;
const TEXT_DEFAULT_FONT_SIZE = 16;
const TEXT_DEFAULT_VALUE = '';

/** Thrown when the SVG cannot be interpreted as a Canvas Note. */
export class CanvasParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CanvasParseError';
	}
}

/** Reverse of escapeCdata in the serializer. */
const ESCAPED_CDATA_TERMINATOR = ']]]]><![CDATA[>';
const RAW_CDATA_TERMINATOR = ']]>';

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numberOr(v: unknown, fallback: number): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function stringOr(v: unknown, fallback: string): string {
	return typeof v === 'string' ? v : fallback;
}

/**
 * Fills in safe defaults for optional text-element fields before
 * validation runs. Keeps the validator strict while letting older or
 * hand-edited documents load without errors.
 */
function normalizeTextElement(raw: Record<string, unknown>): void {
	raw.x = numberOr(raw.x, TEXT_DEFAULT_X);
	raw.y = numberOr(raw.y, TEXT_DEFAULT_Y);
	raw.width = numberOr(raw.width, TEXT_DEFAULT_WIDTH);
	raw.height = numberOr(raw.height, TEXT_DEFAULT_HEIGHT);
	raw.fontSize = numberOr(raw.fontSize, TEXT_DEFAULT_FONT_SIZE);
	raw.text = stringOr(raw.text, TEXT_DEFAULT_VALUE);
	// Old documents predate sizingMode; default to 'fixed' to preserve
	// the original "user controls both axes" behavior.
	raw.sizingMode = raw.sizingMode === 'auto' ? 'auto' : 'fixed';
}

/**
 * Normalizes optional fields on arrow/line elements introduced after the
 * initial release (strokeStyle, startArrow, endArrow). Old documents
 * predate these fields - we derive sensible defaults so the validator
 * never fails on previously-saved canvases.
 */
function normalizeLineLikeElement(raw: Record<string, unknown>): void {
	if (raw.strokeStyle !== 'dashed' && raw.strokeStyle !== 'dotted' && raw.strokeStyle !== 'solid') {
		raw.strokeStyle = 'solid';
	}
	if (raw.startArrow !== 'arrow' && raw.startArrow !== 'none') {
		raw.startArrow = 'none';
	}
	if (raw.endArrow !== 'arrow' && raw.endArrow !== 'none') {
		// Preserve the original visual: arrows had a head, lines did not.
		raw.endArrow = raw.type === 'arrow' ? 'arrow' : 'none';
	}
}

/**
 * Walks the parsed JSON document and normalizes elements that need
 * fallback handling.
 */
function normalizeDocument(parsed: unknown): void {
	if (!isPlainObject(parsed)) return;
	const elements = parsed.elements;
	if (!Array.isArray(elements)) return;
	for (const el of elements) {
		if (!isPlainObject(el)) continue;
		if (el.type === 'text') normalizeTextElement(el);
		else if (el.type === 'arrow' || el.type === 'line') normalizeLineLikeElement(el);
	}
}

/**
 * Locates the Canvas metadata element body. Tolerates attribute order,
 * arbitrary whitespace and either single or double quotes around the id.
 */
function extractMetadataBody(svg: string): string {
	const openRe = new RegExp(
		`<metadata\\b[^>]*\\bid\\s*=\\s*["']${CANVAS_METADATA_ID}["'][^>]*>`,
		'i',
	);
	const openMatch = openRe.exec(svg);
	if (!openMatch) {
		throw new CanvasParseError(
			`SVG does not contain <metadata id="${CANVAS_METADATA_ID}">; not a Canvas Note`,
		);
	}
	const start = openMatch.index + openMatch[0].length;
	const closeIdx = svg.indexOf('</metadata>', start);
	if (closeIdx < 0) {
		throw new CanvasParseError('Unterminated <metadata> element in Canvas SVG');
	}
	return svg.slice(start, closeIdx);
}

/**
 * Extracts the JSON payload from the metadata element body, supporting
 * both forms: a CDATA section (default) and plain entity-escaped content
 * (used by some XML pretty-printers that strip CDATA).
 */
function extractJson(body: string): string {
	const trimmed = body.trim();
	const cdataRe = /^<!\[CDATA\[([\s\S]*?)\]\]>$/;
	const m = cdataRe.exec(trimmed);
	if (m) {
		return m[1].split(ESCAPED_CDATA_TERMINATOR).join(RAW_CDATA_TERMINATOR);
	}
	// Non-CDATA fallback: assume the body is XML-escaped JSON.
	return unescapeXml(trimmed);
}

/**
 * Parses an SVG string and returns the embedded CanvasDocument.
 * Throws CanvasParseError on missing/invalid metadata or malformed JSON,
 * and Error from validation if the model is structurally invalid.
 */
export function parseCanvasFromSvg(svg: string): CanvasDocument {
	if (typeof svg !== 'string' || svg.length === 0) {
		throw new CanvasParseError('SVG input is empty');
	}
	const rawBody = extractMetadataBody(svg);
	const json = extractJson(rawBody);

	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch (e) {
		const reason = e instanceof Error ? e.message : String(e);
		throw new CanvasParseError(`Canvas metadata JSON is invalid: ${reason}`);
	}

	normalizeDocument(parsed);

	try {
		assertCanvasDocument(parsed);
	} catch (e) {
		const reason = e instanceof Error ? e.message : String(e);
		throw new CanvasParseError(`Canvas metadata is structurally invalid: ${reason}`);
	}
	return parsed;
}
