/**
 * Canvas Note domain model.
 *
 * Source of truth - JSON, embedded into the SVG via
 * <metadata id="joplin-canvas-data">. SVG geometry is just a projection
 * for portable display and is never parsed back into the model.
 */

export type ElementType =
	| 'rectangle'
	| 'square'
	| 'circle'
	| 'ellipse'
	| 'shape'
	| 'arrow'
	| 'line'
	| 'freehand'
	| 'noteCard'
	| 'todoCard'
	| 'text';

/**
 * Sub-discriminator for the unified shape model.
 *
 * The unified shape covers IT/diagram primitives that all share the same
 * box-like bounds (x, y, w, h). Legacy types ('rectangle', 'square',
 * 'circle', 'ellipse') predate this model and are kept for backward
 * compatibility. New shape kinds must be added here.
 */
export type ShapeKind =
	| 'diamond'
	| 'parallelogram'
	| 'hexagon'
	| 'triangle'
	| 'cylinder'
	| 'cloud'
	| 'card'
	| 'callout'
	| 'document';

/** Common fields for every element. */
export interface BaseElement {
	/** Stable unique identifier within the document. */
	id: string;
	/** Discriminator for the union. */
	type: ElementType;
	/** Render order: larger z renders on top. */
	z: number;
}


/** Common visual style for shapes that have stroke + fill. */
export interface ShapeStyle {
	stroke: string;
	strokeWidth: number;
	fill: string;
}

/** Rectangle defined by top-left corner + size. */
export interface RectangleElement extends BaseElement, ShapeStyle {
	type: 'rectangle';
	x: number;
	y: number;
	w: number;
	h: number;
	/** Optional corner radius. */
	rx?: number;
}

/** Square is a constrained rectangle: width === height === size. */
export interface SquareElement extends BaseElement, ShapeStyle {
	type: 'square';
	x: number;
	y: number;
	size: number;
	rx?: number;
}

/** Circle defined by center + radius. */
export interface CircleElement extends BaseElement, ShapeStyle {
	type: 'circle';
	cx: number;
	cy: number;
	r: number;
}

/** Ellipse defined by center + radii. */
export interface EllipseElement extends BaseElement, ShapeStyle {
	type: 'ellipse';
	cx: number;
	cy: number;
	rx: number;
	ry: number;
}

/**
 * Unified shape element: a box-bounded primitive whose visual is
 * determined by `shapeType`. Adding a new diagram shape requires only
 * extending ShapeKind and the renderer dispatch; geometry, hit-test,
 * resize and selection handles work uniformly across all kinds.
 */
export interface ShapeElement extends BaseElement, ShapeStyle {
	type: 'shape';
	shapeType: ShapeKind;
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * Arrow endpoint. Either a free point (x,y) or an anchor on another
 * element (attachedTo); when attachedTo is set, x/y are the last cached
 * coordinates and may be recomputed on render.
 */
export interface ArrowEndpoint {
	x: number;
	y: number;
	attachedTo?: string;
}

/** Stroke dash style for line-like elements. */
export type LineStrokeStyle = 'solid' | 'dashed' | 'dotted';

/** Arrowhead presence on a line endpoint. */
export type LineArrowKind = 'none' | 'arrow';

/**
 * Common fields for arrow/line elements. Both share endpoints, stroke
 * style and optional arrowhead markers on each end. The legacy `type`
 * discriminator stays (line vs arrow) for backward compatibility, but
 * real visual behavior is driven by `startArrow` / `endArrow` /
 * `strokeStyle`. Defaults applied on load:
 *   - strokeStyle: 'solid'
 *   - startArrow:  'none'
 *   - endArrow:    'arrow' if type === 'arrow', otherwise 'none'
 */
export interface ArrowElement extends BaseElement {
	type: 'arrow';
	from: ArrowEndpoint;
	to: ArrowEndpoint;
	stroke: string;
	strokeWidth: number;
	strokeStyle?: LineStrokeStyle;
	startArrow?: LineArrowKind;
	endArrow?: LineArrowKind;
}

/** Plain line (no marker). Same shape as ArrowElement but visually undecorated. */
export interface LineElement extends BaseElement {
	type: 'line';
	from: ArrowEndpoint;
	to: ArrowEndpoint;
	stroke: string;
	strokeWidth: number;
	strokeStyle?: LineStrokeStyle;
	startArrow?: LineArrowKind;
	endArrow?: LineArrowKind;
}

/**
 * Free-hand stroke captured as a polyline of (x,y) points in document space.
 * Drawn while the user holds the mouse button under the Pen tool.
 */
export interface FreehandElement extends BaseElement {
	type: 'freehand';
	points: { x: number; y: number }[];
	stroke: string;
	strokeWidth: number;
}

/** Card that visually represents a Joplin note. (x,y) is top-left. */
export interface NoteCardElement extends BaseElement {
	type: 'noteCard';
	x: number;
	y: number;
	w: number;
	h: number;
	noteId: string;
	title: string;
	/** Short body preview shown under the title. */
	preview?: string;
	/** True if the linked note was missing on last validation. */
	broken?: boolean;
}

/** Same as NoteCardElement but for to-do notes; tracks completion. */
export interface TodoCardElement extends BaseElement {
	type: 'todoCard';
	x: number;
	y: number;
	w: number;
	h: number;
	noteId: string;
	title: string;
	completed: boolean;
	/** Short body preview shown under the title. */
	preview?: string;
	/** True if the linked todo was missing on last validation. */
	broken?: boolean;
}

/**
 * Plain text element. Has a rectangular area defined by
 * (x, y, width, height) and a sizingMode that decides how the box reacts
 * to text/fontSize/width changes:
 *   - 'fixed': the user controls width and height directly; text overflow
 *              flows below the declared box visually (no clipping for MVP);
 *   - 'auto':  width is user-controlled, height is recomputed from the
 *              wrapped line count so the box always fits its content.
 */
export type TextSizingMode = 'fixed' | 'auto';

export interface TextElement extends BaseElement {
	type: 'text';
	x: number;
	y: number;
	width: number;
	height: number;
	text: string;
	fontSize: number;
	sizingMode: TextSizingMode;
}

/** Discriminated union of all supported elements. */
export type CanvasElement =
	| RectangleElement
	| SquareElement
	| CircleElement
	| EllipseElement
	| ShapeElement
	| ArrowElement
	| LineElement
	| FreehandElement
	| NoteCardElement
	| TodoCardElement
	| TextElement;

/** Canvas document - top level container persisted inside SVG metadata. */
export interface CanvasDocument {
	version: 1;
	width: number;
	height: number;
	background: string;
	elements: CanvasElement[];
	meta: {
		createdAt: string;
		updatedAt: string;
	};
}
