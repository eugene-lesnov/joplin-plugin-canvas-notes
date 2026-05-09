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
	// Shared helpers (must be loaded before the renderer and the controller).
	`./${WEBVIEW_DIR}/canvasGeometry.js`,
	`./${WEBVIEW_DIR}/canvasHandles.js`,
	`./${WEBVIEW_DIR}/textWrap.js`,
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
}

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
 * Loads the canvas for a note and forwards it to the webview.
 * Errors stay non-fatal: the editor view receives an error message and
 * remains alive so the user can switch to a different note.
 */
async function loadAndPushCanvas(state: EditorInstanceState, noteId: string): Promise<void> {
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
		postError(state, `Failed to load canvas: ${msg}`);
		// eslint-disable-next-line no-console
		console.error('[Canvas Notes] loadAndPushCanvas failed:', e);
	}
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
	};
}

async function onSetup(handle: ViewHandle): Promise<void> {
	const state: EditorInstanceState = {
		handle,
		ready: false,
		pendingLoad: null,
		active: null,
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
