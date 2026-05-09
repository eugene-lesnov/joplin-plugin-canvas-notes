/**
 * Helpers for the Canvas Note body markup.
 *
 * Body shape (kept stable so onActivationCheck stays cheap):
 *
 *   # Canvas: <title>
 *
 *   <!-- canvas-notes -->
 *   ![Canvas](:/<resourceId>)
 *
 * The HTML comment is the activation marker: presence of CANVAS_BODY_MARKER
 * means "this note is a Canvas Note", so the editor view can decide whether
 * to activate without parsing the SVG resource.
 */

/** Marker that identifies a Canvas Note in body text. */
export const CANVAS_BODY_MARKER = '<!-- canvas-notes -->';

const RESOURCE_ID_RE = /:\/([a-f0-9]{32})/i;

/** Returns the first :/<id> resource reference in the body, or null. */
export function findFirstResourceId(body: string): string | null {
	if (!body) return null;
	const m = RESOURCE_ID_RE.exec(body);
	return m ? m[1] : null;
}

/** True if the body contains the Canvas Note marker. */
export function isCanvasNoteBody(body: string | undefined | null): boolean {
	return !!body && body.indexOf(CANVAS_BODY_MARKER) >= 0;
}

/** Builds the canonical markdown body for a Canvas Note. */
export function buildCanvasNoteBody(title: string, resourceId: string): string {
	return (
		`# Canvas: ${title}\n\n` +
		`${CANVAS_BODY_MARKER}\n` +
		`![Canvas](:/${resourceId})\n`
	);
}
