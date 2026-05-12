/**
 * Runtime validation of CanvasDocument / CanvasElement instances loaded
 * from external sources (SVG metadata, plugin storage etc.).
 *
 * Pure functions, no Joplin / DOM dependencies. Throws Error with a
 * descriptive message on any structural problem.
 */

import { CanvasDocument, CanvasElement, ElementType } from './canvasTypes';

export const CANVAS_MODEL_VERSION = 1 as const;

const SUPPORTED_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
	'rectangle',
	'square',
	'circle',
	'ellipse',
	'shape',
	'arrow',
	'line',
	'freehand',
	'noteCard',
	'todoCard',
	'text',
]);

const SUPPORTED_SHAPE_KINDS: ReadonlySet<string> = new Set<string>([
	// Primitives.
	'rectangle', 'ellipse', 'roundedRectangle',
	'triangle', 'diamond', 'parallelogram', 'trapezoid',
	'hexagon', 'pentagon', 'star',
	// Flowchart.
	'terminator', 'document', 'multipleDocuments',
	'manualInput', 'predefinedProcess', 'delay', 'offPageConnector',
	// Architecture.
	'cylinder', 'cloud', 'queue', 'server', 'actor',
	'browser', 'mobile', 'laptop', 'desktop', 'container',
	'gear', 'loadBalancer', 'firewall', 'lock', 'folder',
	// Notes.
	'card', 'callout', 'stickyNote',
]);

const SUPPORTED_STROKE_STYLES: ReadonlySet<string> = new Set<string>(['solid', 'dashed', 'dotted']);
const SUPPORTED_ARROW_KINDS: ReadonlySet<string> = new Set<string>([
	'none', 'arrow', 'triangle', 'diamond-open', 'diamond-filled',
]);

const SUPPORTED_LABEL_ALIGNS: ReadonlySet<string> = new Set<string>(['left', 'center', 'right']);
const SUPPORTED_LABEL_VALIGNS: ReadonlySet<string> = new Set<string>(['top', 'middle', 'bottom']);

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
	return typeof v === 'number' && Number.isFinite(v);
}

function isString(v: unknown): v is string {
	return typeof v === 'string';
}

function isElementType(v: unknown): v is ElementType {
	return typeof v === 'string' && SUPPORTED_TYPES.has(v as ElementType);
}

function validateBase(e: Record<string, unknown>): void {
	if (!isString(e.id) || e.id.length === 0) throw new Error('Element.id must be a non-empty string');
	if (!isElementType(e.type)) throw new Error(`Element.type is unsupported: ${String(e.type)}`);
	if (!isFiniteNumber(e.z)) throw new Error('Element.z must be a finite number');
}

function validateShapeStyle(e: Record<string, unknown>): void {
	if (!isString(e.stroke)) throw new Error('stroke must be string');
	if (!isFiniteNumber(e.strokeWidth)) throw new Error('strokeWidth must be number');
	if (!isString(e.fill)) throw new Error('fill must be string');
}

/**
 * Validates the optional embedded label on a shape. The field is
 * optional - missing label is fine and means the shape has no caption.
 * When present, every sub-field must be valid.
 */
function validateShapeLabel(e: Record<string, unknown>): void {
	if (e.label === undefined) return;
	if (!isObject(e.label)) throw new Error('label must be an object');
	const l = e.label;
	if (!isString(l.text)) throw new Error('label.text must be string');
	if (!isFiniteNumber(l.fontSize) || l.fontSize <= 0) throw new Error('label.fontSize must be a positive number');
	if (!isString(l.color)) throw new Error('label.color must be string');
	if (!isString(l.align) || !SUPPORTED_LABEL_ALIGNS.has(l.align)) {
		throw new Error('label.align must be left|center|right');
	}
	if (!isString(l.verticalAlign) || !SUPPORTED_LABEL_VALIGNS.has(l.verticalAlign)) {
		throw new Error('label.verticalAlign must be top|middle|bottom');
	}
}

function validateElement(raw: unknown): asserts raw is CanvasElement {
	if (!isObject(raw)) throw new Error('Element must be an object');
	validateBase(raw);
	switch (raw.type) {
		case 'rectangle':
			if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) throw new Error('rectangle: x,y required');
			if (!isFiniteNumber(raw.w) || !isFiniteNumber(raw.h)) throw new Error('rectangle: w,h required');
			validateShapeStyle(raw);
			validateShapeLabel(raw);
			break;
		case 'square':
			if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) throw new Error('square: x,y required');
			if (!isFiniteNumber(raw.size)) throw new Error('square: size required');
			validateShapeStyle(raw);
			validateShapeLabel(raw);
			break;
		case 'circle':
			if (!isFiniteNumber(raw.cx) || !isFiniteNumber(raw.cy)) throw new Error('circle: cx,cy required');
			if (!isFiniteNumber(raw.r)) throw new Error('circle: r required');
			validateShapeStyle(raw);
			validateShapeLabel(raw);
			break;
		case 'ellipse':
			if (!isFiniteNumber(raw.cx) || !isFiniteNumber(raw.cy)) throw new Error('ellipse: cx,cy required');
			if (!isFiniteNumber(raw.rx) || !isFiniteNumber(raw.ry)) throw new Error('ellipse: rx,ry required');
			validateShapeStyle(raw);
			validateShapeLabel(raw);
			break;
		case 'shape':
			if (!isString(raw.shapeType) || !SUPPORTED_SHAPE_KINDS.has(raw.shapeType)) {
				throw new Error(`shape.shapeType is unsupported: ${String(raw.shapeType)}`);
			}
			if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) throw new Error('shape: x,y required');
			if (!isFiniteNumber(raw.w) || !isFiniteNumber(raw.h)) throw new Error('shape: w,h required');
			validateShapeStyle(raw);
			validateShapeLabel(raw);
			break;
		case 'arrow':
		case 'line': {
			const kind = raw.type;
			if (!isObject(raw.from) || !isObject(raw.to)) throw new Error(`${kind}: from/to required`);
			const f = raw.from;
			const t = raw.to;
			if (!isFiniteNumber(f.x) || !isFiniteNumber(f.y)) throw new Error(`${kind}.from: x,y required`);
			if (!isFiniteNumber(t.x) || !isFiniteNumber(t.y)) throw new Error(`${kind}.to: x,y required`);
			if (!isString(raw.stroke)) throw new Error(`${kind}.stroke required`);
			if (!isFiniteNumber(raw.strokeWidth)) throw new Error(`${kind}.strokeWidth required`);
			if (raw.strokeStyle !== undefined && !SUPPORTED_STROKE_STYLES.has(String(raw.strokeStyle))) {
				throw new Error(`${kind}.strokeStyle must be solid|dashed|dotted`);
			}
			if (raw.startArrow !== undefined && !SUPPORTED_ARROW_KINDS.has(String(raw.startArrow))) {
				throw new Error(`${kind}.startArrow must be none|arrow`);
			}
			if (raw.endArrow !== undefined && !SUPPORTED_ARROW_KINDS.has(String(raw.endArrow))) {
				throw new Error(`${kind}.endArrow must be none|arrow`);
			}
			break;
		}
		case 'freehand': {
			if (!Array.isArray(raw.points) || raw.points.length < 2) {
				throw new Error('freehand.points: at least two points required');
			}
			for (const p of raw.points) {
				if (!isObject(p) || !isFiniteNumber(p.x) || !isFiniteNumber(p.y)) {
					throw new Error('freehand.points: each point must have x,y');
				}
			}
			if (!isString(raw.stroke)) throw new Error('freehand.stroke required');
			if (!isFiniteNumber(raw.strokeWidth)) throw new Error('freehand.strokeWidth required');
			break;
		}
		case 'noteCard':
		case 'todoCard':
			if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) throw new Error('card: x,y required');
			if (!isFiniteNumber(raw.w) || !isFiniteNumber(raw.h)) throw new Error('card: w,h required');
			if (!isString(raw.noteId)) throw new Error('card.noteId required');
			if (!isString(raw.title)) throw new Error('card.title required');
			if (raw.type === 'todoCard' && typeof raw.completed !== 'boolean') {
				throw new Error('todoCard.completed required');
			}
			break;
		case 'text':
			if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) throw new Error('text: x,y required');
			if (!isFiniteNumber(raw.width) || !isFiniteNumber(raw.height)) throw new Error('text: width,height required');
			if (!isString(raw.text)) throw new Error('text.text must be string');
			if (!isFiniteNumber(raw.fontSize)) throw new Error('text.fontSize must be number');
			if (raw.sizingMode !== 'fixed' && raw.sizingMode !== 'auto') {
				throw new Error('text.sizingMode must be "fixed" or "auto"');
			}
			break;
	}
}

/**
 * Type guard: validates an arbitrary value as CanvasDocument.
 * Throws Error with a descriptive message if invalid.
 */
export function assertCanvasDocument(raw: unknown): asserts raw is CanvasDocument {
	if (!isObject(raw)) throw new Error('CanvasDocument must be an object');
	if (raw.version !== CANVAS_MODEL_VERSION) {
		throw new Error(`Unsupported CanvasDocument.version: ${String(raw.version)}`);
	}
	if (!isFiniteNumber(raw.width) || !isFiniteNumber(raw.height)) {
		throw new Error('CanvasDocument.width/height must be numbers');
	}
	if (!isString(raw.background)) throw new Error('CanvasDocument.background must be string');
	if (!Array.isArray(raw.elements)) throw new Error('CanvasDocument.elements must be array');
	for (const el of raw.elements) validateElement(el);
	if (!isObject(raw.meta) || !isString(raw.meta.createdAt) || !isString(raw.meta.updatedAt)) {
		throw new Error('CanvasDocument.meta is invalid');
	}
}

/** Non-throwing variant of assertCanvasDocument. */
export function isCanvasDocument(raw: unknown): raw is CanvasDocument {
	try {
		assertCanvasDocument(raw);
		return true;
	} catch {
		return false;
	}
}
