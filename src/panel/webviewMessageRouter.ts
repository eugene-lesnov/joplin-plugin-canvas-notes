/**
 * Routes messages coming from the Canvas Editor webview to the proper
 * backend handler. The router is stateless on its own; per-instance state
 * is owned by the editor controller and passed in.
 */

import { CanvasDocument } from '../canvas/canvasTypes';
import { serializeCanvasToSvg } from '../canvas/svgSerializer';
import strings, { formatLocalizedString } from '../i18n/localization';
import { openNote } from '../joplin/notesApi';
import { updateSvgResource } from '../joplin/resourcesApi';
import { getNoteSummaryById, searchNotes } from '../joplin/searchApi';
import {
	CheckLinkedNotesResponse,
	NoteLinkStatus,
	NoteSummaryResponse,
	OperationResult,
	SearchNotesResponse,
	WebviewToBackend,
} from './messageTypes';

/** Minimal context needed to satisfy webview requests for an editor instance. */
export interface MessageContext {
	/** Currently active canvas (loaded note + its SVG resource), if any. */
	getActive(): { resourceId: string; doc: CanvasDocument } | null;
	/** Updates the in-memory document after a successful save. */
	setActiveDoc(doc: CanvasDocument): void;
	/** Marks the webview as ready to receive `loadCanvas` messages. */
	markReady(): void;
	/** Routes a flush ack back to the pending flush-before-reload promise. */
	resolveFlushAck(requestId: string, ok: boolean, error?: string): void;
}

/** Public entry: handle a message and return a response to the webview. */
export async function handleWebviewMessage(
	ctx: MessageContext,
	message: WebviewToBackend,
): Promise<OperationResult | unknown> {
	try {
		return await dispatch(ctx, message);
	} catch (e) {
		const error = e instanceof Error ? e.message : String(e);
		// eslint-disable-next-line no-console
		console.error('[Canvas Notes] webview handler error:', e);
		return { ok: false, error };
	}
}

async function dispatch(
	ctx: MessageContext,
	message: WebviewToBackend,
): Promise<OperationResult | unknown> {
	switch (message.type) {
		case 'ready':
			ctx.markReady();
			return { ok: true };

		case 'flushAck':
			ctx.resolveFlushAck(message.requestId, message.ok, message.error);
			return { ok: true };

		case 'saveCanvas': {
			const active = ctx.getActive();
			if (!active) return { ok: false, error: strings.errorNoActiveCanvas };
			const svg = serializeCanvasToSvg(message.doc);
			await updateSvgResource(active.resourceId, svg);
			ctx.setActiveDoc(message.doc);
			return { ok: true };
		}

		case 'openLinkedNote': {
			const summary = await getNoteSummaryById(message.noteId);
			if (!summary) return { ok: false, error: strings.errorLinkedNoteMissing };
			await openNote(message.noteId);
			return { ok: true };
		}

		case 'searchNotes': {
			const items = await searchNotes(message.query);
			const response: SearchNotesResponse = { ok: true, items };
			return response;
		}

		case 'checkLinkedNotes': {
			const statuses = await Promise.all(
				message.noteIds.map(async (id): Promise<NoteLinkStatus> => {
					const s = await getNoteSummaryById(id);
					if (!s) return { id, exists: false };
					return {
						id,
						exists: true,
						title: s.title,
						isTodo: s.isTodo,
						todoCompleted: s.todoCompleted,
						tags: s.tags,
					};
				}),
			);
			const response: CheckLinkedNotesResponse = { ok: true, statuses };
			return response;
		}

		case 'getNoteSummary': {
			const s = await getNoteSummaryById(message.noteId);
			if (!s) return { ok: false, error: strings.errorLinkedNoteMissing };
			const response: NoteSummaryResponse = {
				ok: true,
				summary: {
					id: s.id,
					title: s.title,
					isTodo: s.isTodo,
					todoCompleted: s.todoCompleted,
					tags: s.tags,
				},
			};
			return response;
		}

		case 'addElement':
			// Webview-side only operation today; the backend just acknowledges.
			return { ok: true };

		default: {
			const _exhaustive: never = message;
			return {
				ok: false,
				error: formatLocalizedString(strings.errorUnknownMessage, {
					message: JSON.stringify(_exhaustive),
				}),
			};
		}
	}
}
