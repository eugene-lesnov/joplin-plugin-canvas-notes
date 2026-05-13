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
import { CanvasDocument, DEFAULT_LINE_LABEL, DEFAULT_SHAPE_LABEL, isShapeType } from './canvasTypes';
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

const LABEL_ALIGNS: ReadonlySet<string> = new Set<string>(['left', 'center', 'right']);
const LABEL_VALIGNS: ReadonlySet<string> = new Set<string>(['top', 'middle', 'bottom']);

/**
 * Fills the embedded shape label with safe defaults. Old documents have
 * no `label` field at all - we materialize it with the MVP defaults so
 * downstream code can always read label.text/.fontSize/etc. without
 * branching on presence.
 *
 * If a partial label is present (e.g. user-edited JSON), each missing
 * or invalid sub-field falls back to its default. Unknown extra keys on
 * the label object are preserved as-is.
 */
function normalizeShapeLabel(raw: Record<string, unknown>): void {
	const existing = isPlainObject(raw.label) ? raw.label : {};
	const align = existing.align;
	const valign = existing.verticalAlign;
	const normalized: Record<string, unknown> = {
		...existing,
		text: stringOr(existing.text, DEFAULT_SHAPE_LABEL.text),
		fontSize: numberOr(existing.fontSize, DEFAULT_SHAPE_LABEL.fontSize),
		color: stringOr(existing.color, DEFAULT_SHAPE_LABEL.color),
		align: typeof align === 'string' && LABEL_ALIGNS.has(align) ? align : DEFAULT_SHAPE_LABEL.align,
		verticalAlign: typeof valign === 'string' && LABEL_VALIGNS.has(valign) ? valign : DEFAULT_SHAPE_LABEL.verticalAlign,
	};
	raw.label = normalized;
}

const LINE_LABEL_POSITIONS: ReadonlySet<string> = new Set<string>(['center']);
const LINE_LABEL_ORIENTATIONS: ReadonlySet<string> = new Set<string>(['parallel', 'horizontal']);

/**
 * Fills the embedded line/arrow label with safe defaults. Same intent
 * as normalizeShapeLabel, but for line-specific fields.
 */
function normalizeLineLabel(raw: Record<string, unknown>): void {
	const existing = isPlainObject(raw.label) ? raw.label : {};
	const position = existing.position;
	const orientation = existing.orientation;
	const normalized: Record<string, unknown> = {
		...existing,
		text: stringOr(existing.text, DEFAULT_LINE_LABEL.text),
		fontSize: numberOr(existing.fontSize, DEFAULT_LINE_LABEL.fontSize),
		color: stringOr(existing.color, DEFAULT_LINE_LABEL.color),
		position: typeof position === 'string' && LINE_LABEL_POSITIONS.has(position)
			? position
			: DEFAULT_LINE_LABEL.position,
		orientation: typeof orientation === 'string' && LINE_LABEL_ORIENTATIONS.has(orientation)
			? orientation
			: DEFAULT_LINE_LABEL.orientation,
	};
	raw.label = normalized;
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
		else if (el.type === 'arrow' || el.type === 'line') {
			normalizeLineLikeElement(el);
			normalizeLineLabel(el);
		}
		if (typeof el.type === 'string' && isShapeType(el.type)) {
			normalizeShapeLabel(el);
		}
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
