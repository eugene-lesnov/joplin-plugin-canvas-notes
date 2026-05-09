/**
 * Pure helpers for creating and mutating CanvasDocument.
 * Has no Joplin / DOM / IO dependencies.
 *
 * Validation lives in canvasValidation.ts; it is re-exported here for
 * backwards compatibility with existing imports.
 */

import { CanvasDocument, CanvasElement, TextElement } from './canvasTypes';
import { CANVAS_MODEL_VERSION } from './canvasValidation';

// Defaults for newly created text elements.
const DEFAULT_TEXT_WIDTH = 200;
const DEFAULT_TEXT_HEIGHT = 80;
const DEFAULT_TEXT_FONT_SIZE = 16;

export {
	CANVAS_MODEL_VERSION,
	assertCanvasDocument,
	isCanvasDocument,
} from './canvasValidation';

const DEFAULT_CANVAS_WIDTH = 2000;
const DEFAULT_CANVAS_HEIGHT = 1500;
const DEFAULT_BACKGROUND = '#ffffff';

/**
 * Generates a stable, reasonably unique element id.
 * Uses crypto.randomUUID when available, otherwise a timestamp+random fallback.
 */
export function generateElementId(): string {
	const cryptoRef: { randomUUID?: () => string } | undefined =
		typeof globalThis !== 'undefined' ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto : undefined;
	if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
		return cryptoRef.randomUUID();
	}
	const rand = Math.random().toString(36).slice(2, 10);
	return `el-${Date.now().toString(36)}-${rand}`;
}

/** Creates an empty Canvas document with default size and timestamps. */
export function createEmptyCanvas(
	width: number = DEFAULT_CANVAS_WIDTH,
	height: number = DEFAULT_CANVAS_HEIGHT,
	background: string = DEFAULT_BACKGROUND,
): CanvasDocument {
	const now = new Date().toISOString();
	return {
		version: CANVAS_MODEL_VERSION,
		width,
		height,
		background,
		elements: [],
		meta: { createdAt: now, updatedAt: now },
	};
}

/**
 * Creates a fresh text element at (x, y) with safe defaults.
 * The z-order is left undefined; addElement assigns a top-most z when
 * the element is inserted into the document.
 */
export function createTextElement(
	x: number,
	y: number,
	overrides: Partial<Pick<TextElement, 'width' | 'height' | 'text' | 'fontSize' | 'sizingMode'>> = {},
): TextElement {
	return {
		id: generateElementId(),
		type: 'text',
		z: 0,
		x,
		y,
		width: overrides.width ?? DEFAULT_TEXT_WIDTH,
		height: overrides.height ?? DEFAULT_TEXT_HEIGHT,
		text: overrides.text ?? '',
		fontSize: overrides.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
		sizingMode: overrides.sizingMode ?? 'fixed',
	};
}

/**
 * Adds an element to the document. Returns a new document instance to keep
 * the operation immutable-friendly for upcoming undo/redo.
 * If the element has no z, it is placed on top.
 */
export function addElement(doc: CanvasDocument, element: CanvasElement): CanvasDocument {
	const topZ = doc.elements.reduce((max, e) => (e.z > max ? e.z : max), 0);
	const withZ: CanvasElement = element.z !== undefined && element.z !== null
		? element
		: ({ ...element, z: topZ + 1 } as CanvasElement);
	return {
		...doc,
		elements: [...doc.elements, withZ],
		meta: { ...doc.meta, updatedAt: new Date().toISOString() },
	};
}
