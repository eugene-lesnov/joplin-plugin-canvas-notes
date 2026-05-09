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

/** id of the arrowhead marker definition. */
export const ARROWHEAD_ID = 'canvas-arrowhead';

// ---- card geometry --------------------------------------------------------

export const CARD_TITLE_HEIGHT = 28;
export const CARD_TITLE_PAD_X = 10;
export const CARD_TITLE_FONT_SIZE = 14;
export const CARD_BODY_FONT_SIZE = 12;
export const CARD_TITLE_MAX_CHARS = 38;

// ---- viewBox / canvas size ------------------------------------------------

export const VIEWBOX_PADDING = 16;
export const MIN_CANVAS_DIMENSION = 1;
