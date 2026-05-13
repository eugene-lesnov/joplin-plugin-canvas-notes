/**
 * Shared SVG-related constants.
 *
 * Both the SVG serializer (TS, server side) and the webview renderer (JS,
 * loaded as plain script) need the same metadata id, namespaces and card
 * geometry. Putting them here keeps the magic numbers in one place on the
 * TS side. The JS side has its own mirror in webview/* for now.
 */

/** Identifier of the <metadata> element that carries the JSON model. */
export const CANVAS_METADATA_ID = 'joplin-canvas-data';

/** SVG 1.1 namespace + version string. */
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
export const SVG_VERSION = '1.1';

/** id of the arrowhead marker definition (used for line end). */
export const ARROWHEAD_ID = 'canvas-arrowhead';

/** id of the arrowhead marker used at the line start (bidirectional). */
export const ARROWHEAD_START_ID = 'canvas-arrowhead-start';

/**
 * IDs of the UML-specific markers. Each marker variant exists in two
 * orientations (end / start) so a line can mix start and end heads
 * independently. Naming convention: `<style>` for the end-of-line marker,
 * `<style>-start` for the start-of-line one.
 */
export const MARKER_TRIANGLE_ID = 'canvas-triangle';
export const MARKER_TRIANGLE_START_ID = 'canvas-triangle-start';
export const MARKER_DIAMOND_OPEN_ID = 'canvas-diamond-open';
export const MARKER_DIAMOND_OPEN_START_ID = 'canvas-diamond-open-start';
export const MARKER_DIAMOND_FILLED_ID = 'canvas-diamond-filled';
export const MARKER_DIAMOND_FILLED_START_ID = 'canvas-diamond-filled-start';

// ---- card geometry --------------------------------------------------------

export const CARD_TITLE_HEIGHT = 28;
export const CARD_TITLE_PAD_X = 10;
export const CARD_TITLE_FONT_SIZE = 14;
export const CARD_BODY_FONT_SIZE = 12;

// ---- viewBox / canvas size ------------------------------------------------

export const VIEWBOX_PADDING = 16;
export const MIN_CANVAS_DIMENSION = 1;
