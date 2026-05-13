/**
 * Canvas Note domain model.
 *
 * Source of truth - JSON, embedded into the SVG via
 * <metadata id="joplin-canvas-data">. SVG geometry is just a projection
 * for portable display and is never parsed back into the model.
 */

/**
 * All box-bounded shape types in a single flat enum.
 *
 * Every value here is rendered by the unified shape pipeline
 * (shapeGeometry + renderer dispatch) and shares the same field set
 * (x, y, w, h + style + optional label). To add a new shape it is
 * enough to extend this union and provide a draw entry in
 * `shapeGeometry.shapeDraw`.
 */
export type ShapeType =
	// Primitives + basic geometric forms.
	| 'rectangle'
	| 'ellipse'
	| 'roundedRectangle'
	| 'triangle'
	| 'diamond'
	| 'parallelogram'
	| 'trapezoid'
	| 'hexagon'
	| 'pentagon'
	| 'star'
	// Flowchart-specific.
	| 'terminator'
	| 'document'
	| 'multipleDocuments'
	| 'manualInput'
	| 'predefinedProcess'
	| 'delay'
	| 'offPageConnector'
	// Architecture (servers, services, networking).
	| 'cylinder'
	| 'cloud'
	| 'queue'
	| 'server'
	| 'actor'
	| 'browser'
	| 'mobile'
	| 'laptop'
	| 'desktop'
	| 'container'
	| 'gear'
	| 'loadBalancer'
	| 'firewall'
	| 'lock'
	| 'folder'
	// Notes / annotations.
	| 'card'
	| 'callout'
	| 'stickyNote';

/** Runtime list of all ShapeType values; mirrors the type union. */
export const SHAPE_TYPES: readonly ShapeType[] = [
	'rectangle', 'ellipse', 'roundedRectangle',
	'triangle', 'diamond', 'parallelogram', 'trapezoid',
	'hexagon', 'pentagon', 'star',
	'terminator', 'document', 'multipleDocuments',
	'manualInput', 'predefinedProcess', 'delay', 'offPageConnector',
	'cylinder', 'cloud', 'queue', 'server', 'actor',
	'browser', 'mobile', 'laptop', 'desktop', 'container',
	'gear', 'loadBalancer', 'firewall', 'lock', 'folder',
	'card', 'callout', 'stickyNote',
];

const SHAPE_TYPE_SET: ReadonlySet<string> = new Set(SHAPE_TYPES);

/** True if the given element-type string is a box-bounded shape. */
export function isShapeType(t: string): t is ShapeType {
	return SHAPE_TYPE_SET.has(t);
}

export type ElementType =
	| ShapeType
	| 'arrow'
	| 'line'
	| 'freehand'
	| 'noteCard'
	| 'todoCard'
	| 'text';

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

/**
 * Horizontal text alignment inside the shape's label box.
 */
export type LabelAlign = 'left' | 'center' | 'right';

/**
 * Vertical text alignment inside the shape's label box.
 */
export type LabelVerticalAlign = 'top' | 'middle' | 'bottom';

/**
 * Embedded label attached to a shape. Plain text only, no markdown,
 * no rich text.
 *
 * Storage model:
 *  - the label is part of the shape element itself, not a separate
 *    overlay element;
 *  - all fields are required at runtime; documents without a label are
 *    normalized on load (see svgParser.normalizeShapeLabel).
 */
export interface ShapeLabel {
	/** User-entered text. Empty string means the shape has no visible label. */
	text: string;
	/** Font size in document units. */
	fontSize: number;
	/** Plain hex color (e.g. '#222222'). Not theme-aware at the model level. */
	color: string;
	align: LabelAlign;
	verticalAlign: LabelVerticalAlign;
}

/** Default label applied to shapes that do not carry one yet. */
export const DEFAULT_SHAPE_LABEL: ShapeLabel = {
	text: '',
	fontSize: 14,
	color: '#222222',
	align: 'center',
	verticalAlign: 'middle',
};

/**
 * Position of a label along a line/arrow. MVP supports only 'center'
 * (geometric midpoint between the endpoints). Reserved for future
 * variants like 'start' / 'end' or a numeric ratio.
 */
export type LineLabelPosition = 'center';

/**
 * How the label is oriented relative to the line:
 *  - 'parallel':   text rotates to follow the line direction (with an
 *                  upright flip so reading direction stays L-to-R),
 *                  positioned above the line. Word-wrapped by line length.
 *  - 'horizontal': text stays horizontal regardless of line angle,
 *                  centered on the midpoint with a backdrop.
 */
export type LineLabelOrientation = 'parallel' | 'horizontal';

/**
 * Embedded label attached to a line / arrow. Same model intent as
 * ShapeLabel (plain text, theme-aware color), but the placement is
 * driven by `position` along the segment rather than an alignment box.
 */
export interface LineLabel {
	/** User-entered text. Empty string means no visible label. */
	text: string;
	fontSize: number;
	color: string;
	position: LineLabelPosition;
	orientation: LineLabelOrientation;
}

export const DEFAULT_LINE_LABEL: LineLabel = {
	text: '',
	fontSize: 14,
	color: '#222222',
	position: 'center',
	orientation: 'parallel',
};

/**
 * Unified box-bounded shape element. Geometry is uniform across all
 * ShapeType values: an axis-aligned rectangle (x, y, w, h) plus shared
 * stroke/fill style and an optional embedded label. The discriminator
 * (`type`) drives the visual rendered by `shapeGeometry.shapeDraw`.
 *
 * Negative width/height are allowed transiently during drag-create /
 * drag-resize; renderers normalize to the absolute bounds.
 */
export interface BoxElement extends BaseElement, ShapeStyle {
	type: ShapeType;
	x: number;
	y: number;
	w: number;
	h: number;
	/** Optional embedded label. Absent on documents without a caption. */
	label?: ShapeLabel;
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

/**
 * Arrowhead variant on a line endpoint. Drives the SVG `marker-*`
 * reference chosen at render time.
 *  - 'none'            no marker;
 *  - 'arrow'           classic filled triangle pointing along the line;
 *  - 'triangle'        open (unfilled) triangle - UML generalization /
 *                      realization;
 *  - 'diamond-open'    UML aggregation;
 *  - 'diamond-filled'  UML composition.
 */
export type LineArrowKind = 'none' | 'arrow' | 'triangle' | 'diamond-open' | 'diamond-filled';

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
	/** Optional embedded label rendered near the segment midpoint. */
	label?: LineLabel;
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
	/** Optional embedded label rendered near the segment midpoint. */
	label?: LineLabel;
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
	/** Tag titles attached to the note. Refreshed on add / validate. */
	tags?: string[];
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
	/** Tag titles attached to the note. Refreshed on add / validate. */
	tags?: string[];
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
	| BoxElement
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
