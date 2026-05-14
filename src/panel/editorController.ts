/**
 * Canvas Editor view (joplin.views.editors).
 *
 * The editor takes over the whole note editor area when the active note
 * is a Canvas Note (detected cheaply via onActivationCheck).
 *
 * Responsibilities of this module:
 *   - register the editor with Joplin;
 *   - own per-instance state (instances of the editor across windows);
 *   - bootstrap the webview (HTML + scripts) on setup;
 *   - load the canvas for the active note and stream it to the webview;
 *   - hook the webview <-> backend message channel.
 *
 * Heavy lifting lives in:
 *   - canvasLoader.ts          (note id -> CanvasDocument)
 *   - webviewMessageRouter.ts  (handle messages from the webview)
 */

import joplin from 'api';
import { ViewHandle } from 'api/types';
import { promises as fs } from 'fs';
import * as path from 'path';
import { CanvasDocument } from '../canvas/canvasTypes';
import strings, { formatLocalizedString } from '../i18n/localization';
import { isCanvasNoteBody } from '../joplin/noteBodyUtils';
import { loadCanvasForNote } from './canvasLoader';
import { BackendToWebview, WebviewToBackend } from './messageTypes';
import { handleWebviewMessage, MessageContext } from './webviewMessageRouter';

const VIEW_ID = 'canvasNotes.editor';

const WEBVIEW_DIR = 'panel/webview';
const WEBVIEW_HTML_NAME = 'index.html';
/** Order matters: dependencies first, controller last. */
const WEBVIEW_SCRIPTS = [
	`./${WEBVIEW_DIR}/styles.css`,
	// Localization must come first so other modules can read CanvasNotes.t.
	`./${WEBVIEW_DIR}/i18n.js`,
	// Shared helpers (must be loaded before the renderer and the controller).
	`./${WEBVIEW_DIR}/canvasTypes.js`,
	`./${WEBVIEW_DIR}/canvasGeometry.js`,
	`./${WEBVIEW_DIR}/canvasHandles.js`,
	`./${WEBVIEW_DIR}/textWrap.js`,
	`./${WEBVIEW_DIR}/shapeGeometry.js`,
	// Generic UI primitives used by the toolbar and other widgets.
	`./${WEBVIEW_DIR}/editor/dropdown.js`,
	// Renderer + ambient UI.
	`./${WEBVIEW_DIR}/canvasRenderer.js`,
	`./${WEBVIEW_DIR}/toolbar.js`,
	`./${WEBVIEW_DIR}/notePicker.js`,
	// Editor controller's own dependencies.
	`./${WEBVIEW_DIR}/editor/constants.js`,
	`./${WEBVIEW_DIR}/editor/factories.js`,
	`./${WEBVIEW_DIR}/editor/transforms.js`,
	`./${WEBVIEW_DIR}/editor/tempPreview.js`,
	`./${WEBVIEW_DIR}/editor/contextMenu.js`,
	`./${WEBVIEW_DIR}/editor/canvasFit.js`,
	// Controller (must be last).
	`./${WEBVIEW_DIR}/canvasEditor.js`,
];

interface ActiveCanvas {
	noteId: string;
	resourceId: string;
	doc: CanvasDocument;
}

/** State per-editor-instance (Joplin can host several across windows). */
interface EditorInstanceState {
	handle: ViewHandle;
	ready: boolean;
	pendingLoad: ActiveCanvas | null;
	active: ActiveCanvas | null;
	/**
	 * In-flight flush handshakes keyed by requestId. The webview replies
	 * with `flushAck` after committing/saving pending edits; we resolve
	 * the matching promise so the reload can proceed without data loss.
	 */
	pendingFlushes: Map<string, (result: { ok: boolean; error?: string }) => void>;
	/**
	 * Serializes load requests so two `onUpdate` events arriving in quick
	 * succession do not race each other (e.g. fast note switching). Each
	 * new load chains onto the previous one's promise.
	 */
	loadQueue: Promise<void>;
}

/**
 * Maximum time we wait for the webview to ack a flush request. After
 * the deadline we proceed with the reload anyway: blocking forever on a
 * dead webview would lock the editor on every note switch.
 */
const FLUSH_TIMEOUT_MS = 3000;

let flushRequestCounter = 0;

const instances = new Map<ViewHandle, EditorInstanceState>();

// ---- helpers ---------------------------------------------------------------

function postToWebview(state: EditorInstanceState, message: BackendToWebview): void {
	joplin.views.editors.postMessage(state.handle, message);
}

function postLoadCanvas(state: EditorInstanceState, target: ActiveCanvas): void {
	postToWebview(state, {
		type: 'loadCanvas',
		noteId: target.noteId,
		resourceId: target.resourceId,
		doc: target.doc,
	});
}

function postError(state: EditorInstanceState, message: string): void {
	postToWebview(state, { type: 'error', message });
}

/**
 * Asks the webview to commit any in-flight edits and persist pending
 * dirty state. Resolves once the webview replies, or after a timeout if
 * the webview is unresponsive. The caller is expected to proceed in
 * either case — blocking the reload would strand the editor.
 */
function requestFlush(state: EditorInstanceState): Promise<{ ok: boolean; error?: string }> {
	if (!state.ready || !state.active) return Promise.resolve({ ok: true });
	const requestId = `flush-${++flushRequestCounter}`;
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			if (state.pendingFlushes.delete(requestId)) {
				// eslint-disable-next-line no-console
				console.warn('[Canvas Notes] flush ack timed out; proceeding with reload');
				resolve({ ok: false, error: 'flush timeout' });
			}
		}, FLUSH_TIMEOUT_MS);
		state.pendingFlushes.set(requestId, (result) => {
			clearTimeout(timer);
			resolve(result);
		});
		postToWebview(state, { type: 'flushBeforeReload', requestId });
	});
}

/**
 * Loads the canvas for a note and forwards it to the webview.
 *
 * Before swapping the active canvas we ask the webview to flush any
 * unsaved edits (autosave debounce, open text overlay, dirty state).
 * The flush ack carries the final `saveCanvas` for the previous note;
 * since `setActiveDoc` runs through the router, the save lands on the
 * OLD `state.active` — it's safe to swap to the new one only after the
 * ack returns. On timeout we still proceed: a stuck webview must not
 * brick note switching.
 *
 * Errors stay non-fatal: the editor view receives an error message and
 * remains alive so the user can switch to a different note.
 */
async function doLoadAndPushCanvas(state: EditorInstanceState, noteId: string): Promise<void> {
	const flushResult = await requestFlush(state);
	if (!flushResult.ok && flushResult.error) {
		// eslint-disable-next-line no-console
		console.warn('[Canvas Notes] flush before reload failed:', flushResult.error);
	}

	try {
		const result = await loadCanvasForNote(noteId);
		if (result.ok === false) {
			if (result.notACanvas === true) state.active = null;
			postError(state, result.message);
			return;
		}
		const target: ActiveCanvas = {
			noteId: result.noteId,
			resourceId: result.resourceId,
			doc: result.doc,
		};
		state.active = target;
		if (state.ready) postLoadCanvas(state, target);
		else state.pendingLoad = target;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		postError(state, formatLocalizedString(strings.errorLoadCanvasFailed, { reason: msg }));
		// eslint-disable-next-line no-console
		console.error('[Canvas Notes] loadAndPushCanvas failed:', e);
	}
}

/**
 * Public entry: schedules a load through the instance's serial queue.
 * The queue prevents two concurrent `onUpdate` events (e.g. user
 * switching notes back-to-back) from racing each other; ordering is
 * preserved and each load sees the result of the previous flush.
 *
 * Не сокращаем по "та же нота" — повторный вход в ту же ноту после
 * переключения на другую и обратно должен сбросить sticky-error
 * баннер и вернуть актуальное содержимое.
 */
function loadAndPushCanvas(state: EditorInstanceState, noteId: string): Promise<void> {
	const next = state.loadQueue.then(() => doLoadAndPushCanvas(state, noteId));
	// Цепь не должна рваться из-за unhandled rejection: doLoadAndPushCanvas
	// уже ловит свои ошибки, но на всякий случай глотаем оставшиеся.
	state.loadQueue = next.catch(() => { /* ignore */ });
	return next;
}

/**
 * Triggers flush handshakes for every editor instance that currently has
 * an active canvas. Used on note-selection changes to ensure dirty
 * state is persisted BEFORE Joplin tears down the canvas editor (e.g.
 * when switching to a non-canvas note: `onUpdate` is NOT fired, so the
 * editor instance loses access to the webview without flush).
 */
export async function flushAllActiveCanvases(): Promise<void> {
	const flushes: Promise<unknown>[] = [];
	for (const state of instances.values()) {
		if (!state.ready || !state.active) continue;
		flushes.push(requestFlush(state));
	}
	if (flushes.length === 0) return;
	await Promise.all(flushes);
}

// ---- onSetup: wire a freshly created editor instance -----------------------

async function loadWebviewHtml(): Promise<string> {
	const installDir = await joplin.plugins.installationDir();
	return fs.readFile(path.join(installDir, WEBVIEW_DIR, WEBVIEW_HTML_NAME), 'utf8');
}

function buildMessageContext(state: EditorInstanceState): MessageContext {
	return {
		getActive: () => state.active,
		setActiveDoc: (doc: CanvasDocument) => {
			if (!state.active) return;
			state.active = { ...state.active, doc };
		},
		markReady: () => {
			state.ready = true;
			if (state.pendingLoad) {
				const toSend = state.pendingLoad;
				state.pendingLoad = null;
				postLoadCanvas(state, toSend);
			}
		},
		resolveFlushAck: (requestId, ok, error) => {
			const resolver = state.pendingFlushes.get(requestId);
			if (!resolver) return;
			state.pendingFlushes.delete(requestId);
			resolver({ ok, error });
		},
	};
}

async function onSetup(handle: ViewHandle): Promise<void> {
	const state: EditorInstanceState = {
		handle,
		ready: false,
		pendingLoad: null,
		active: null,
		pendingFlushes: new Map(),
		loadQueue: Promise.resolve(),
	};
	instances.set(handle, state);

	await joplin.views.editors.setHtml(handle, await loadWebviewHtml());
	for (const script of WEBVIEW_SCRIPTS) {
		await joplin.views.editors.addScript(handle, script);
	}

	const ctx = buildMessageContext(state);
	await joplin.views.editors.onMessage(handle, (message: WebviewToBackend) =>
		handleWebviewMessage(ctx, message),
	);

	// Whenever the underlying note changes (or the editor becomes visible),
	// reload the canvas. We ignore the body Joplin gives us and read the
	// resource via our pipeline so we always have a valid CanvasDocument.
	await joplin.views.editors.onUpdate(handle, async ({ noteId }) => {
		if (!noteId) return;
		await loadAndPushCanvas(state, noteId);
	});

	// Initial load: the editor may be created with a current note already.
	const selected = await joplin.workspace.selectedNote();
	if (selected && selected.id) await loadAndPushCanvas(state, selected.id);
}

// ---- onActivationCheck: cheap probe ---------------------------------------

async function onActivationCheck({ noteId }: { noteId: string }): Promise<boolean> {
	if (!noteId) return false;
	try {
		const note = await joplin.data.get(['notes', noteId], { fields: ['body'] });
		return isCanvasNoteBody(note && note.body);
	} catch {
		return false;
	}
}

// ---- public entry ----------------------------------------------------------

export async function registerCanvasEditor(): Promise<void> {
	await joplin.views.editors.register(VIEW_ID, {
		onActivationCheck,
		onSetup,
	});
}
