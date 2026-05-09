/**
 * Loads the CanvasDocument for a given Joplin note.
 *
 * Accepts a note id, walks through the Joplin pipeline (note body -> SVG
 * resource -> parsed model) and returns either the resolved canvas or a
 * structured failure with a user-facing message. The caller decides how
 * to surface the failure (e.g. push an error message to the webview).
 */

import joplin from 'api';
import { CanvasDocument } from '../canvas/canvasTypes';
import { CanvasParseError, parseCanvasFromSvg } from '../canvas/svgParser';
import { findFirstResourceId, isCanvasNoteBody } from '../joplin/noteBodyUtils';
import { readSvgResource } from '../joplin/resourcesApi';

/** Resolved canvas data attached to a specific note. */
export interface CanvasLoadSuccess {
	ok: true;
	noteId: string;
	resourceId: string;
	doc: CanvasDocument;
}

/** Failure with a message ready to be shown to the user. */
export interface CanvasLoadFailure {
	ok: false;
	/** True when the note is simply not a Canvas Note (no marker). */
	notACanvas?: boolean;
	message: string;
}

export type CanvasLoadResult = CanvasLoadSuccess | CanvasLoadFailure;

/**
 * Reads the note, validates the body marker, resolves the SVG resource id,
 * loads the resource and parses it into a CanvasDocument.
 *
 * Errors are converted into structured failures so the caller can surface
 * them without crashing the editor view.
 */
export async function loadCanvasForNote(noteId: string): Promise<CanvasLoadResult> {
	if (!noteId) {
		return { ok: false, message: 'No note id provided' };
	}

	const note = await joplin.data.get(['notes', noteId], { fields: ['id', 'body'] });
	if (!note || !isCanvasNoteBody(note.body)) {
		return {
			ok: false,
			notACanvas: true,
			message: 'This note is not a Canvas Note. Use Tools -> Canvas Notes -> Create Canvas Note.',
		};
	}

	const resourceId = findFirstResourceId(note.body || '');
	if (!resourceId) {
		return {
			ok: false,
			message: 'Canvas Note body has no embedded SVG resource. The body has likely been edited manually.',
		};
	}

	let svg: string;
	try {
		svg = await readSvgResource(resourceId);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return { ok: false, message: `SVG resource not found or unreadable (${msg}).` };
	}

	try {
		const doc = parseCanvasFromSvg(svg);
		return { ok: true, noteId, resourceId, doc };
	} catch (e) {
		if (e instanceof CanvasParseError) {
			const hint = /metadata/i.test(e.message)
				? 'Canvas metadata is missing or corrupted.'
				: 'Cannot read canvas data.';
			return { ok: false, message: `${hint} ${e.message}` };
		}
		throw e;
	}
}
