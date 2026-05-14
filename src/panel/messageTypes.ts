/**
 * Typed message contract between the Canvas Editor backend (Node)
 * and the WebView (browser). Both sides import this file.
 *
 * Each message has a unique `type` that acts as a discriminator.
 */

import { CanvasDocument, CanvasElement } from '../canvas/canvasTypes';

// ---- backend -> webview ----------------------------------------------------

export interface LoadCanvasMessage {
	type: 'loadCanvas';
	noteId: string;
	resourceId: string;
	doc: CanvasDocument;
}

export interface ErrorMessage {
	type: 'error';
	message: string;
}

/**
 * Asks the webview to commit any in-flight edits and flush pending
 * dirty state to disk BEFORE the backend swaps the active note. The
 * webview must reply with a matching {@link FlushAckMessage} carrying
 * the same `requestId`. Used to prevent data loss on note switch.
 */
export interface FlushBeforeReloadMessage {
	type: 'flushBeforeReload';
	requestId: string;
}

export type BackendToWebview = LoadCanvasMessage | ErrorMessage | FlushBeforeReloadMessage;

// ---- webview -> backend ----------------------------------------------------

export interface ReadyMessage {
	type: 'ready';
}

export interface SaveCanvasMessage {
	type: 'saveCanvas';
	doc: CanvasDocument;
}

export interface OpenLinkedNoteMessage {
	type: 'openLinkedNote';
	noteId: string;
}

export interface SearchNotesMessage {
	type: 'searchNotes';
	query: string;
}

export interface AddElementMessage {
	type: 'addElement';
	element: CanvasElement;
}

/** Asks backend to verify that the given note ids still exist. */
export interface CheckLinkedNotesMessage {
	type: 'checkLinkedNotes';
	noteIds: string[];
}

/**
 * Asks backend for a full summary of a single note (title, todo state,
 * tags). Used right after picking a note in the picker so the new card
 * is created with its tags already attached.
 */
export interface GetNoteSummaryMessage {
	type: 'getNoteSummary';
	noteId: string;
}

/**
 * Acknowledges {@link FlushBeforeReloadMessage}. `ok` reports whether
 * the webview managed to commit and save the in-flight document. Even
 * on `ok: false` the backend proceeds with the load to avoid getting
 * the editor stuck — the failure is reported separately.
 */
export interface FlushAckMessage {
	type: 'flushAck';
	requestId: string;
	ok: boolean;
	error?: string;
}

export type WebviewToBackend =
	| ReadyMessage
	| SaveCanvasMessage
	| OpenLinkedNoteMessage
	| SearchNotesMessage
	| AddElementMessage
	| CheckLinkedNotesMessage
	| GetNoteSummaryMessage
	| FlushAckMessage;

// ---- response shapes -------------------------------------------------------

/** Generic ack-or-error response returned from backend message handler. */
export interface OperationResult {
	ok: boolean;
	error?: string;
}

export interface NoteSearchHit {
	id: string;
	title: string;
	isTodo: boolean;
	todoCompleted: boolean;
}

export interface SearchNotesResponse extends OperationResult {
	items: NoteSearchHit[];
}

export interface NoteLinkStatus {
	id: string;
	exists: boolean;
	title?: string;
	isTodo?: boolean;
	todoCompleted?: boolean;
	tags?: string[];
}

export interface CheckLinkedNotesResponse extends OperationResult {
	statuses: NoteLinkStatus[];
}

export interface NoteSummaryResponse extends OperationResult {
	summary?: {
		id: string;
		title: string;
		isTodo: boolean;
		todoCompleted: boolean;
		tags: string[];
	};
}
