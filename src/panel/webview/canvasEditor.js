/* eslint-disable no-undef */
/**
 * Canvas Editor controller (state + tools + events).
 *
 * Owns:
 *  - the in-memory CanvasDocument;
 *  - selected element id;
 *  - active tool;
 *  - dirty state machine;
 *  - zoom level;
 *  - pointer events on the SVG and document-level keyboard.
 *
 * Delegates:
 *  - rendering         -> CanvasNotes.Renderer
 *  - geometry          -> CanvasNotes.Geometry
 *  - handles           -> CanvasNotes.Handles
 *  - element factories -> CanvasNotes.EditorFactories
 *  - translate/resize  -> CanvasNotes.EditorTransforms
 *  - temp drag preview -> CanvasNotes.EditorTempPreview
 *  - context menu      -> CanvasNotes.EditorContextMenu
 *  - canvas fit        -> CanvasNotes.EditorCanvasFit
 *  - toolbar UI        -> CanvasNotes.Toolbar
 *  - note picker       -> CanvasNotes.NotePicker
 */

(function () {
	'use strict';

	const Renderer = window.CanvasNotes && window.CanvasNotes.Renderer;
	const Geometry = window.CanvasNotes && window.CanvasNotes.Geometry;
	const Handles = window.CanvasNotes && window.CanvasNotes.Handles;
	const Toolbar = window.CanvasNotes && window.CanvasNotes.Toolbar;
	const Factories = window.CanvasNotes && window.CanvasNotes.EditorFactories;
	const Transforms = window.CanvasNotes && window.CanvasNotes.EditorTransforms;
	const TempPreview = window.CanvasNotes && window.CanvasNotes.EditorTempPreview;
	const ContextMenu = window.CanvasNotes && window.CanvasNotes.EditorContextMenu;
	const CanvasFit = window.CanvasNotes && window.CanvasNotes.EditorCanvasFit;
	const C = window.CanvasNotes && window.CanvasNotes.EditorConstants;
	function notePicker() { return window.CanvasNotes && window.CanvasNotes.NotePicker; }

	function t(key, fallback) {
		const i18n = window.CanvasNotes && window.CanvasNotes.t;
		return typeof i18n === 'function' ? i18n(key) : fallback;
	}

	// --- runtime state ------------------------------------------------------

	/** @type {object|null} the document driven by the user */
	let doc = null;
	let noteId = null;
	let resourceId = null;

	let selectedId = null;
	let activeTool = 'select';
	let toolbarApi = null;

	/** Status state machine: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'. */
	let saveState = 'idle';
	let lastError = null;

	/** Drag state for select/move and arrow drawing. */
	let dragState = null;

	/** True while space is held - enables temporary pan with primary button. */
	let spaceDown = false;

	/** Auto-save debounce timer id. */
	let autosaveHandle = null;

	let zoom = 1;

	let canvasFit = null;

	/** Active text-editing overlay state, or null when no element is being edited. */
	let textEditor = null;

	// --- text size controls -------------------------------------------------

	const TEXT_FONT_SIZE_MIN = 8;
	const TEXT_FONT_SIZE_MAX = 96;
	const TEXT_FONT_SIZE_STEP = 2;

	// Defaults and minimums for text-box geometry. Kept in sync with the
	// transforms module so drag-create and resize agree on bounds.
	const TEXT_DEFAULT_W = 200;
	const TEXT_DEFAULT_H = 80;
	const TEXT_MIN_W = 40;
	const TEXT_MIN_H = 24;

	function clampFontSize(v) {
		if (!Number.isFinite(v)) return TEXT_FONT_SIZE_MIN;
		return Math.max(TEXT_FONT_SIZE_MIN, Math.min(TEXT_FONT_SIZE_MAX, Math.round(v)));
	}

	function getSelectedTextElement() {
		if (!doc || !selectedId) return null;
		const el = doc.elements.find((e) => e.id === selectedId);
		return (el && el.type === 'text') ? el : null;
	}

	/**
	 * Applies a font-size delta to the selected text element. Updates the
	 * model, redraws, marks dirty, and keeps the overlay textarea in sync
	 * when an in-place edit happens to be active for the same element.
	 */
	function adjustSelectedTextFontSize(delta) {
		const sel = getSelectedTextElement();
		if (!sel) return;
		const next = clampFontSize((sel.fontSize || 16) + delta);
		if (next === sel.fontSize) return;

		const changed = mapElement(sel.id, (e) =>
			Object.assign({}, e, { fontSize: next }));
		if (!changed) return;
		markDirty();
		render();
		syncTextEditorFontSize(sel.id, next);
	}

	function syncTextEditorFontSize(elementId, fontSize) {
		if (!textEditor || textEditor.elementId !== elementId) return;
		const node = svg();
		const ctm = node && node.getScreenCTM ? node.getScreenCTM() : null;
		const scale = (ctm && ctm.a) ? ctm.a : 1;
		textEditor.textarea.style.fontSize = `${fontSize * scale}px`;
	}

	/** Replaces an element in the doc using a transform fn. Returns whether anything changed. */
	function mapElement(elementId, transform) {
		if (!doc) return false;
		let changed = false;
		const nextElements = doc.elements.map((e) => {
			if (e.id !== elementId) return e;
			const next = transform(e);
			if (next !== e) changed = true;
			return next;
		});
		if (changed) doc = Object.assign({}, doc, { elements: nextElements });
		return changed;
	}

	// --- DOM lookups --------------------------------------------------------

	function $(id) { return document.getElementById(id); }
	function svg() { return $('canvas'); }

	// --- status / errors / dirty state -------------------------------------

	function setStatus(text, state) {
		const el = $('canvas-status');
		if (!el) return;
		el.textContent = text || '';
		el.dataset.state = state || 'idle';
	}

	function showError(message) {
		const el = $('canvas-error');
		lastError = message || null;
		if (!el) return;
		if (!message) { el.hidden = true; el.textContent = ''; return; }
		el.textContent = message;
		el.hidden = false;
	}

	function isDirty() { return saveState === 'dirty' || saveState === 'error'; }

	function markDirty() {
		saveState = 'dirty';
		showError(null);
		setStatus(t('statusUnsaved', 'Unsaved changes'), 'dirty');
		updateToolbar();
		scheduleAutosave();
	}

	function scheduleAutosave() {
		if (autosaveHandle) clearTimeout(autosaveHandle);
		autosaveHandle = setTimeout(() => {
			autosaveHandle = null;
			if (saveState !== 'dirty') return;
			// Skip while the user is interacting with the canvas.
			if (dragState) { scheduleAutosave(); return; }
			void onSaveClick();
		}, C.AUTOSAVE_DEBOUNCE_MS);
	}

	function updateToolbar() {
		const saveBtn = $('btn-save');
		if (saveBtn) saveBtn.disabled = !doc || !isDirty() || saveState === 'saving';

		const delBtn = $('btn-delete');
		if (delBtn) delBtn.disabled = !selectedId;

		const zoomReset = $('btn-zoom-reset');
		if (zoomReset) zoomReset.textContent = `${Math.round(zoom * 100)}%`;
		const zoomIn = $('btn-zoom-in');
		if (zoomIn) zoomIn.disabled = zoom >= C.ZOOM_MAX - 1e-6;
		const zoomOut = $('btn-zoom-out');
		if (zoomOut) zoomOut.disabled = zoom <= C.ZOOM_MIN + 1e-6;

		updateTextControls();
		updateEmptyState();
	}

	function updateTextControls() {
		const group = $('text-controls');
		if (!group) return;
		const sel = getSelectedTextElement();
		if (!sel) {
			group.hidden = true;
			return;
		}
		group.hidden = false;
		const valueLabel = $('font-size-value');
		if (valueLabel) valueLabel.textContent = String(sel.fontSize);
		const smaller = $('btn-font-smaller');
		if (smaller) smaller.disabled = sel.fontSize <= TEXT_FONT_SIZE_MIN;
		const larger = $('btn-font-larger');
		if (larger) larger.disabled = sel.fontSize >= TEXT_FONT_SIZE_MAX;
	}

	function updateEmptyState() {
		const hint = $('canvas-empty');
		if (!hint) return;
		const hasContent = !!(doc && doc.elements && doc.elements.length > 0);
		hint.classList.toggle('is-visible', !!doc && !hasContent);
	}

	// --- coordinate transforms ---------------------------------------------

	/**
	 * Converts a pointer event in client space into document (SVG) space.
	 * Robust against zoom and viewport scrolling because it relies on the
	 * SVG screen CTM rather than computing offsets manually.
	 */
	function clientToDoc(evt) {
		const node = svg();
		if (!node) return { x: 0, y: 0 };
		const pt = node.createSVGPoint();
		pt.x = evt.clientX;
		pt.y = evt.clientY;
		const ctm = node.getScreenCTM();
		if (!ctm) return { x: pt.x, y: pt.y };
		const local = pt.matrixTransform(ctm.inverse());
		return { x: local.x, y: local.y };
	}

	function nextZ() {
		if (!doc || !doc.elements.length) return 1;
		return doc.elements.reduce((m, e) => (e.z > m ? e.z : m), 0) + 1;
	}

	// --- mutation helpers ---------------------------------------------------

	function addElement(el) {
		doc = Object.assign({}, doc, { elements: doc.elements.concat([el]) });
		selectedId = el.id;
		markDirty();
		render();
		if (activeTool !== 'select' && !C.STICKY_TOOLS.has(activeTool)) {
			setActiveTool('select');
		}
	}

	function deleteElement(id) {
		if (!id) return;
		doc = Object.assign({}, doc, { elements: doc.elements.filter((e) => e.id !== id) });
		if (selectedId === id) selectedId = null;
		markDirty();
		render();
	}

	function applyTranslate(elementId, dx, dy) {
		doc = Object.assign({}, doc, {
			elements: doc.elements.map((e) =>
				(e.id === elementId ? Transforms.translateElement(e, dx, dy) : e)),
		});
	}

	function applyResize(elementId, handle, initial, p) {
		doc = Object.assign({}, doc, {
			elements: doc.elements.map((e) =>
				(e.id === elementId ? Transforms.resizeElement(e, initial, handle, p) : e)),
		});
	}

	function applyCanvasResize(state, p) {
		const next = Transforms.resizeCanvas(state, p);
		if (next.width === doc.width && next.height === doc.height) return;
		doc = Object.assign({}, doc, { width: next.width, height: next.height });
	}

	// --- rendering wrappers -------------------------------------------------

	function render() {
		if (!doc) return;
		Renderer.renderDocument(svg(), doc, selectedId);
		applyZoom();
		updateToolbar();
	}

	function refreshSelection() {
		Renderer.drawSelection(svg(), doc, selectedId);
		updateToolbar();
	}

	/** Applies the current zoom by sizing the SVG; viewBox stays in document units. */
	function applyZoom() {
		const node = svg();
		if (!node || !doc) return;
		node.setAttribute('width', String(doc.width * zoom));
		node.setAttribute('height', String(doc.height * zoom));
	}

	function setZoom(next) {
		const clamped = Math.max(C.ZOOM_MIN, Math.min(C.ZOOM_MAX, next));
		if (Math.abs(clamped - zoom) < 1e-6) return;
		zoom = clamped;
		applyZoom();
		updateToolbar();
	}

	/**
	 * Ctrl/Cmd + wheel zooms toward the cursor: the document point under the
	 * mouse stays anchored. Plain wheel falls through to normal scroll.
	 */
	function onWheel(evt) {
		if (!(evt.ctrlKey || evt.metaKey)) return;
		evt.preventDefault();
		const stage = $('canvas-stage');
		const node = svg();
		if (!stage || !node || !doc) return;

		const factor = evt.deltaY < 0 ? C.ZOOM_STEP : 1 / C.ZOOM_STEP;
		const nextZoom = Math.max(C.ZOOM_MIN, Math.min(C.ZOOM_MAX, zoom * factor));
		if (Math.abs(nextZoom - zoom) < 1e-6) return;

		const stageRect = stage.getBoundingClientRect();
		const offX = evt.clientX - stageRect.left;
		const offY = evt.clientY - stageRect.top;
		const preLeft = stage.scrollLeft + offX;
		const preTop = stage.scrollTop + offY;

		const ratio = nextZoom / zoom;
		zoom = nextZoom;
		applyZoom();

		stage.scrollLeft = preLeft * ratio - offX;
		stage.scrollTop = preTop * ratio - offY;

		updateToolbar();
	}

	// --- hit testing --------------------------------------------------------

	function pickElementAt(p) {
		if (!doc) return null;
		const list = doc.elements.slice().sort((a, b) => b.z - a.z);
		for (const e of list) {
			if (Geometry.hitTest(e, p.x, p.y)) return e;
		}
		return null;
	}

	// --- pointer interaction ------------------------------------------------

	function setActiveTool(toolId) {
		// Committing the open textarea first ensures the user does not lose
		// in-flight edits when they pick another tool from the toolbar.
		if (textEditor) closeTextOverlayEditor('commit');
		activeTool = toolId;
		const node = svg();
		if (node) node.setAttribute('data-tool', toolId);
		if (toolbarApi) toolbarApi.setActive(toolId);
		if (toolId !== 'select' && selectedId !== null) {
			selectedId = null;
			refreshSelection();
		}
	}

	function updateHoverCursor(p) {
		const node = svg();
		if (!node) return;
		// While dragging or panning, the cursor is set inline; do not override.
		if (dragState) return;
		if (spaceDown) { node.style.cursor = 'grab'; return; }

		// Canvas-resize handles work for any active tool.
		if (doc) {
			const ch = Handles.pickCanvasHandleAt(doc, p);
			if (ch) { node.style.cursor = ch.cursor; return; }
		}

		if (activeTool !== 'select') { node.style.cursor = ''; return; }

		if (selectedId) {
			const sel = doc && doc.elements.find((e) => e.id === selectedId);
			if (sel && Handles.pickElementHandleAt(sel, p)) {
				node.style.cursor = ''; // handle has its own inline cursor
				return;
			}
		}
		const hit = pickElementAt(p);
		if (!hit) { node.style.cursor = ''; return; }
		if (hit.type === 'noteCard' || hit.type === 'todoCard') {
			node.style.cursor = 'pointer';
		} else {
			node.style.cursor = 'grab';
		}
	}

	function startPan(evt) {
		const stage = $('canvas-stage');
		if (!stage) return;
		dragState = {
			mode: 'panning',
			startClientX: evt.clientX,
			startClientY: evt.clientY,
			startScrollLeft: stage.scrollLeft,
			startScrollTop: stage.scrollTop,
		};
		const node = svg();
		if (node) node.style.cursor = 'grabbing';
		try { evt.target.setPointerCapture && evt.target.setPointerCapture(evt.pointerId); } catch (_) { /* ignore */ }
	}

	function cloneElement(el) { return JSON.parse(JSON.stringify(el)); }

	function onPointerDown(evt) {
		if (!doc) return;
		// While the text overlay editor is active, canvas-level pointer
		// interactions are disabled. Clicking inside the textarea is handled
		// by the input itself; clicking outside should commit the editor
		// without simultaneously starting selection / move / drawing in the
		// same event cycle. preventDefault stops the canvas from grabbing
		// focus or starting a drag; the textarea's blur listener takes care
		// of the actual commit.
		if (textEditor) {
			evt.preventDefault();
			return;
		}

		// Middle mouse button OR primary button + space => pan.
		if (evt.button === 1 || (evt.button === 0 && spaceDown)) {
			evt.preventDefault();
			startPan(evt);
			return;
		}

		if (evt.button !== 0) return;
		const p = clientToDoc(evt);

		// Canvas resize handles take priority over everything else - they sit on
		// top of the elements layer and have their own cursor.
		const canvasHandle = Handles.pickCanvasHandleAt(doc, p);
		if (canvasHandle) {
			dragState = {
				mode: 'resizing-canvas',
				handle: canvasHandle.name,
				initialW: doc.width,
				initialH: doc.height,
				startDocX: p.x, startDocY: p.y,
			};
			return;
		}

		const toolDef = Toolbar.getToolDef ? Toolbar.getToolDef(activeTool) : null;
		// Fall back to a hardcoded mapping when the toolbar lookup is
		// unavailable (defensive: keeps legacy tool ids working even if the
		// toolbar module fails to load).
		const toolKind = toolDef
			? toolDef.kind
			: (activeTool === 'select' ? 'select'
				: activeTool === 'pen' ? 'pen'
					: activeTool === 'text' ? 'text'
						: (activeTool === 'arrow' || activeTool === 'line') ? 'line'
							: (activeTool === 'square' || activeTool === 'circle') ? 'legacy'
								: null);

		if (toolKind === 'select') {
			handleSelectPointerDown(evt, p);
			return;
		}

		if (toolKind === 'line') {
			// All line variants (solid/dashed/dotted, arrow/bidir/plain) flow
			// through the same drag-draw gesture; lineSpec carries the visual.
			dragState = {
				mode: 'segment-drawing',
				lineSpec: toolDef.lineSpec,
				start: p, current: p,
			};
			TempPreview.showSegment(svg(), toolDef.lineSpec, p, p);
			return;
		}

		if (toolKind === 'pen') {
			dragState = { mode: 'pen-drawing', points: [p] };
			TempPreview.showFreehand(svg(), dragState.points);
			return;
		}

		if (toolKind === 'text') {
			// Start a drag-create gesture: a small drag becomes a default-sized
			// box on mouse-up; a real drag yields a custom-sized box. The mode
			// is mutually exclusive with select/move/resize via dragState.
			dragState = {
				mode: 'text-creating',
				start: p,
				current: p,
				startClientX: evt.clientX,
				startClientY: evt.clientY,
			};
			return;
		}

		if (toolKind === 'legacy' || toolKind === 'shape') {
			// Drag-create gesture: a small drag (or plain click) yields a
			// default-sized shape centered on the click point; a real drag
			// produces a shape that exactly fills the user-drawn box.
			// Preview kind: legacy 'circle' draws an ellipse preview, everything
			// else uses a dashed bbox rectangle (cheap, unambiguous).
			const previewKind = activeTool === 'circle' ? 'circle' : 'rect';
			dragState = {
				mode: 'shape-creating',
				toolId: activeTool,
				toolKind: toolKind,
				shapeType: toolDef && toolDef.shapeType ? toolDef.shapeType : null,
				previewKind: previewKind,
				start: p,
				current: p,
				startClientX: evt.clientX,
				startClientY: evt.clientY,
			};
		}
	}

	/**
	 * Minimal modal prompt. Resolves the callback with the entered string,
	 * or null on cancel / Escape / backdrop click. Single instance: a new
	 * call replaces the previous modal.
	 */
	function promptForText(title, callback, initialValue) {
		const existing = document.getElementById('text-prompt-overlay');
		if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

		const overlay = document.createElement('div');
		overlay.id = 'text-prompt-overlay';
		overlay.setAttribute('style',
			'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.35);' +
			'display:flex;align-items:center;justify-content:center;');

		const dialog = document.createElement('div');
		dialog.setAttribute('style',
			'background:#fff;color:#222;border-radius:6px;padding:14px 16px;' +
			'min-width:280px;box-shadow:0 6px 24px rgba(0,0,0,0.25);font:13px sans-serif;');

		const label = document.createElement('div');
		label.textContent = title;
		label.setAttribute('style', 'margin-bottom:8px;font-weight:600;');
		dialog.appendChild(label);

		const input = document.createElement('input');
		input.type = 'text';
		if (typeof initialValue === 'string') input.value = initialValue;
		input.setAttribute('style',
			'width:100%;box-sizing:border-box;padding:6px 8px;' +
			'border:1px solid #bbb;border-radius:4px;font:inherit;');
		dialog.appendChild(input);

		const buttons = document.createElement('div');
		buttons.setAttribute('style',
			'margin-top:12px;display:flex;justify-content:flex-end;gap:8px;');

		const btnCancel = document.createElement('button');
		btnCancel.type = 'button';
		btnCancel.textContent = t('promptCancel', 'Cancel');
		const btnOk = document.createElement('button');
		btnOk.type = 'button';
		btnOk.textContent = t('promptOk', 'OK');
		buttons.appendChild(btnCancel);
		buttons.appendChild(btnOk);
		dialog.appendChild(buttons);

		overlay.appendChild(dialog);
		document.body.appendChild(overlay);

		let done = false;
		function finish(result) {
			if (done) return;
			done = true;
			if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
			document.removeEventListener('keydown', onKey, true);
			try { callback(result); } catch (e) { console.error('[Canvas Notes] text prompt callback failed:', e); }
		}
		function onKey(evt) {
			if (evt.key === 'Escape') { evt.preventDefault(); evt.stopPropagation(); finish(null); }
			else if (evt.key === 'Enter') { evt.preventDefault(); evt.stopPropagation(); finish(input.value); }
		}

		btnCancel.addEventListener('click', () => finish(null));
		btnOk.addEventListener('click', () => finish(input.value));
		overlay.addEventListener('mousedown', (evt) => {
			if (evt.target === overlay) finish(null);
		});
		document.addEventListener('keydown', onKey, true);

		setTimeout(() => {
			input.focus();
			// Select pre-filled text so typing replaces it immediately.
			if (input.value.length > 0) input.select();
		}, 0);
	}

	function handleSelectPointerDown(evt, p) {
		// 1) handle hit?
		if (selectedId) {
			const sel = doc.elements.find((e) => e.id === selectedId);
			const h = sel && Handles.pickElementHandleAt(sel, p);
			if (h) {
				dragState = {
					mode: 'resizing',
					elementId: sel.id,
					handle: h.name,
					initial: cloneElement(sel),
					startDocX: p.x, startDocY: p.y,
				};
				return;
			}
		}
		// 2) element hit?
		const hit = pickElementAt(p);
		if (hit) {
			selectedId = hit.id;
			dragState = {
				mode: 'maybe-move',
				elementId: hit.id,
				startDocX: p.x, startDocY: p.y,
				startClientX: evt.clientX, startClientY: evt.clientY,
			};
			const node = svg();
			if (node) node.style.cursor = 'grabbing';
			refreshSelection();
		} else if (selectedId !== null) {
			selectedId = null;
			refreshSelection();
		}
	}

	function onPointerMove(evt) {
		if (!dragState) {
			updateHoverCursor(clientToDoc(evt));
			return;
		}
		const p = clientToDoc(evt);

		switch (dragState.mode) {
			case 'panning': {
				const stage = $('canvas-stage');
				if (!stage) return;
				stage.scrollLeft = dragState.startScrollLeft - (evt.clientX - dragState.startClientX);
				stage.scrollTop = dragState.startScrollTop - (evt.clientY - dragState.startClientY);
				return;
			}
			case 'resizing-canvas':
				applyCanvasResize(dragState, p);
				render();
				return;
			case 'maybe-move':
			case 'moving': {
				const dxClient = evt.clientX - dragState.startClientX;
				const dyClient = evt.clientY - dragState.startClientY;
				if (
					dragState.mode === 'maybe-move' &&
					Math.hypot(dxClient, dyClient) < C.DRAG_THRESHOLD_PX
				) {
					return;
				}
				const dx = p.x - dragState.startDocX;
				const dy = p.y - dragState.startDocY;
				dragState.startDocX = p.x;
				dragState.startDocY = p.y;
				dragState.mode = 'moving';
				applyTranslate(dragState.elementId, dx, dy);
				render();
				return;
			}
			case 'resizing':
				applyResize(dragState.elementId, dragState.handle, dragState.initial, p);
				render();
				return;
			case 'segment-drawing':
				dragState.current = p;
				TempPreview.showSegment(svg(), dragState.lineSpec, dragState.start, p);
				return;
			case 'pen-drawing':
				appendPenPoint(p);
				TempPreview.showFreehand(svg(), dragState.points);
				return;
			case 'text-creating':
				dragState.current = p;
				TempPreview.showRect(svg(), dragState.start, p);
				return;
			case 'shape-creating':
				dragState.current = p;
				TempPreview.showShape(svg(), dragState.previewKind, dragState.start, p);
				return;
		}
	}

	function appendPenPoint(p) {
		const pts = dragState.points;
		const last = pts[pts.length - 1];
		if (Math.hypot(p.x - last.x, p.y - last.y) < C.PEN_MIN_DISTANCE) return;
		pts.push({ x: p.x, y: p.y });
	}

	function onPointerUp(_evt) {
		if (!dragState) return;
		const finished = dragState;
		dragState = null;

		const node = svg();
		if (node) node.style.cursor = '';

		switch (finished.mode) {
			case 'panning':
				return;
			case 'resizing-canvas':
			case 'moving':
			case 'resizing':
				markDirty();
				return;
			case 'segment-drawing': {
				TempPreview.clearSegment(svg());
				const dx = finished.current.x - finished.start.x;
				const dy = finished.current.y - finished.start.y;
				if (Math.hypot(dx, dy) < C.DRAG_THRESHOLD_PX) return;
				const spec = finished.lineSpec || { type: 'line' };
				addElement(Factories.makeSegment(spec.type, finished.start, finished.current, nextZ(), spec));
				return;
			}
			case 'pen-drawing': {
				TempPreview.clearFreehand(svg());
				const pts = finished.points;
				if (pts.length < 2) return; // ignore stray clicks
				addElement(Factories.makeFreehand(pts, nextZ()));
				return;
			}
			case 'text-creating': {
				TempPreview.clearRect(svg());
				finishTextCreate(finished);
				return;
			}
			case 'shape-creating': {
				TempPreview.clearShape(svg());
				finishShapeCreate(finished);
				return;
			}
		}
	}

	/**
	 * Materializes the drag-created shape (legacy or unified). A drag
	 * larger than the min threshold along both axes uses the user-drawn
	 * bounds; a smaller drag or plain click falls back to a default-sized
	 * shape centered on the click point. Mirrors text-create UX so single
	 * clicks remain useful.
	 */
	function finishShapeCreate(state) {
		const from = state.start;
		const to = state.current;
		const rawW = Math.abs(to.x - from.x);
		const rawH = Math.abs(to.y - from.y);
		const hasDraggedSize = rawW >= C.SHAPE_DRAG_MIN_SIZE && rawH >= C.SHAPE_DRAG_MIN_SIZE;
		const bounds = {
			x: Math.min(from.x, to.x),
			y: Math.min(from.y, to.y),
			width: rawW,
			height: rawH,
		};

		// Unified shape (diamond, hexagon, cylinder, ...).
		if (state.toolKind === 'shape' && state.shapeType) {
			if (hasDraggedSize) {
				addElement(Factories.makeShapeFromBounds(state.shapeType, bounds, nextZ()));
			} else {
				addElement(Factories.makeShape(state.shapeType, from, nextZ()));
			}
			return;
		}

		// Legacy shapes: square (rectangle model) and circle (ellipse model).
		if (state.toolId === 'square' || state.toolKind === 'legacy' && state.toolId === 'square') {
			if (hasDraggedSize) {
				addElement(Factories.makeRectangleFromBounds(bounds, nextZ()));
			} else {
				addElement(Factories.makeRectangle(from, nextZ()));
			}
			return;
		}

		if (state.toolId === 'circle') {
			if (hasDraggedSize) {
				addElement(Factories.makeEllipseFromBounds(bounds, nextZ()));
			} else {
				addElement(Factories.makeEllipse(from, nextZ()));
			}
		}
	}

	/**
	 * Materializes the drag-created text box. Drags larger than the min
	 * threshold honor the user-drawn bounds; anything smaller (incl. a
	 * plain click) falls back to the default size anchored at the click
	 * point. After insertion the overlay editor opens for immediate input.
	 */
	function finishTextCreate(state) {
		const from = state.start;
		const to = state.current;
		const rawW = Math.abs(to.x - from.x);
		const rawH = Math.abs(to.y - from.y);

		let bounds;
		if (rawW >= TEXT_MIN_W && rawH >= TEXT_MIN_H) {
			bounds = {
				x: Math.min(from.x, to.x),
				y: Math.min(from.y, to.y),
				width: rawW,
				height: rawH,
			};
		} else {
			bounds = { x: from.x, y: from.y, width: TEXT_DEFAULT_W, height: TEXT_DEFAULT_H };
		}

		const draft = Object.assign(
			Factories.makeText({ x: bounds.x, y: bounds.y }, nextZ(), ''),
			{ width: bounds.width, height: bounds.height },
		);
		openTextOverlayEditor(draft, (nextText) => {
			const trimmed = (nextText || '').replace(/^\s+|\s+$/g, '');
			if (trimmed.length === 0) return; // empty - drop the draft
			addElement(Object.assign({}, draft, { text: nextText }));
		});
		// Sticky: stay on Text tool so the user can keep adding boxes.
		// Switching to Select happens automatically only when the editor
		// closes (addElement -> select), matching the previous UX.
	}

	// --- keyboard -----------------------------------------------------------

	function onKeyDown(evt) {
		const target = evt.target;
		const isEditable = target && (target.tagName === 'INPUT'
			|| target.tagName === 'TEXTAREA' || target.isContentEditable);

		// Ctrl/Cmd+S works everywhere. When pressed inside the text overlay,
		// onSaveClick commits the in-flight edit first so the save flushes
		// the latest textarea content into the document.
		if ((evt.ctrlKey || evt.metaKey) && (evt.key === 's' || evt.key === 'S')) {
			evt.preventDefault();
			void onSaveClick();
			return;
		}

		if (isEditable) return;

		// Canvas-level shortcuts (Delete / Escape / Space) must stay inert
		// while the text overlay editor is open; the textarea handles its
		// own keys and we don't want Delete to wipe the element being edited.
		if (textEditor) return;

		if (evt.code === 'Space' && !spaceDown) {
			spaceDown = true;
			evt.preventDefault();
			const node = svg();
			if (node && !dragState) node.style.cursor = 'grab';
			return;
		}

		if (evt.key === 'Delete' || evt.key === 'Backspace') {
			if (selectedId) {
				deleteElement(selectedId);
				evt.preventDefault();
			}
			return;
		}
		if (evt.key === 'Escape') {
			ContextMenu.hide();
			if (selectedId !== null) {
				selectedId = null;
				refreshSelection();
			} else if (activeTool !== 'select') {
				setActiveTool('select');
			}
		}
	}

	function onKeyUp(evt) {
		if (evt.code === 'Space' && spaceDown) {
			spaceDown = false;
			const node = svg();
			if (node && !dragState) node.style.cursor = '';
		}
	}

	// --- context menu ------------------------------------------------------

	function onContextMenu(evt) {
		if (!doc) return;
		evt.preventDefault();
		const p = clientToDoc(evt);
		const hit = pickElementAt(p);
		if (hit) {
			selectedId = hit.id;
			refreshSelection();
			updateToolbar();
		}
		ContextMenu.show(evt.clientX, evt.clientY, buildContextMenuItems(hit));
	}

	function buildContextMenuItems(hit) {
		if (!hit) {
			return [
				{ label: t('ctxAddNote', 'Add note/task...'), action: onAddNoteClick },
				{ label: t('ctxResetZoom', 'Reset zoom'), action: () => setZoom(1) },
			];
		}
		const items = [];
		if (hit.type === 'noteCard' || hit.type === 'todoCard') {
			items.push({ label: t('ctxOpenLinkedNote', 'Open linked note'), action: () => openCardLink(hit) });
		}
		items.push({ label: t('ctxBringToFront', 'Bring to front'), action: () => zOrder(hit.id, 'front') });
		items.push({ label: t('ctxSendToBack', 'Send to back'),  action: () => zOrder(hit.id, 'back') });
		items.push({ label: t('ctxDelete', 'Delete'), action: () => deleteElement(hit.id) });
		return items;
	}

	async function openCardLink(card) {
		const res = await postMessage({ type: 'openLinkedNote', noteId: card.noteId });
		if (res && res.ok === false) {
			markCardBroken(card.id, true);
			showError((res && res.error) || t('errorOpenLinkedNote', 'Failed to open linked note'));
		}
	}

	/** Moves an element to the very top or very bottom in z-order. */
	function zOrder(elementId, where) {
		if (!doc) return;
		const zs = doc.elements.map((e) => e.z);
		const maxZ = zs.length ? Math.max.apply(null, zs) : 0;
		const minZ = zs.length ? Math.min.apply(null, zs) : 0;
		const target = where === 'front' ? maxZ + 1 : minZ - 1;
		doc = Object.assign({}, doc, {
			elements: doc.elements.map((e) =>
				(e.id === elementId ? Object.assign({}, e, { z: target }) : e)),
		});
		markDirty();
		render();
	}

	// --- backend bridge -----------------------------------------------------

	async function postMessage(message) {
		if (typeof webviewApi === 'undefined' || !webviewApi.postMessage) {
			console.warn('[Canvas Notes] webviewApi missing, message dropped:', message);
			return null;
		}
		try {
			return await webviewApi.postMessage(message);
		} catch (e) {
			console.error('[Canvas Notes] postMessage failed:', e);
			return null;
		}
	}

	function handleBackendMessage(message) {
		if (!message || typeof message !== 'object') return;
		switch (message.type) {
			case 'loadCanvas':
				// A reload swaps the document under our feet; abandon any
				// in-flight text edit to avoid writing into a stale element.
				if (textEditor) closeTextOverlayEditor('cancel');
				noteId = message.noteId;
				resourceId = message.resourceId;
				doc = message.doc;
				selectedId = null;
				saveState = 'idle';
				showError(null);
				setStatus(t('statusLoaded', 'Loaded'), 'idle');
				if (canvasFit) canvasFit.start(doc);
				render();
				void validateLinkedCards();
				break;
			case 'error':
				showError(message.message || t('errorUnknown', 'Unknown error'));
				saveState = 'error';
				setStatus(t('statusError', 'Error'), 'error');
				updateToolbar();
				break;
			default:
				console.warn('[Canvas Notes] unknown backend message:', message);
		}
	}

	async function onSaveClick() {
		if (!doc) {
			showError(t('errorNothingToSave', 'Nothing to save: canvas is not loaded yet'));
			return;
		}
		// Flush the textarea overlay so the user's in-flight edits land in
		// the document before serialization.
		if (textEditor) closeTextOverlayEditor('commit');
		if (saveState === 'saving') return;
		saveState = 'saving';
		setStatus(t('statusSaving', 'Saving...'), 'saving');
		updateToolbar();

		const updatedDoc = Object.assign({}, doc, {
			meta: Object.assign({}, doc.meta, { updatedAt: new Date().toISOString() }),
		});
		const res = await postMessage({ type: 'saveCanvas', doc: updatedDoc });
		if (res && res.ok) {
			doc = updatedDoc;
			showError(null);
			saveState = 'idle';
			setStatus(t('statusSaved', 'Saved'), 'saved');
		} else {
			const err = (res && res.error) || t('errorSaveFailed', 'Save failed');
			showError(err);
			saveState = 'error';
			setStatus(t('statusSaveFailed', 'Save failed'), 'error');
		}
		updateToolbar();
	}

	function onDeleteClick() {
		if (selectedId) deleteElement(selectedId);
	}

	function onAddNoteClick() {
		const picker = notePicker();
		if (!picker) {
			showError(t('errorPickerUnavailable', 'Note picker is not available'));
			return;
		}
		picker.open((summary) => {
			if (!doc) return;
			addElement(Factories.makeCardFromSummary(summary, defaultCardCenter(), nextZ()));
		});
	}

	/** Computes the target document-space center for a freshly-added card. */
	function defaultCardCenter() {
		const stage = $('canvas-stage');
		const node = svg();
		const fallback = doc ? { x: doc.width / 2, y: doc.height / 2 } : { x: 0, y: 0 };
		if (!stage || !node) return fallback;
		const rect = stage.getBoundingClientRect();
		const center = clientToDoc({
			clientX: rect.left + rect.width / 2,
			clientY: rect.top + rect.height / 2,
		});
		if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return fallback;
		return center;
	}

	async function onCanvasDoubleClick(evt) {
		if (!doc) return;
		const p = clientToDoc(evt);
		const hit = pickElementAt(p);
		if (!hit) return;

		if (hit.type === 'text') {
			editTextElement(hit);
			return;
		}

		if (hit.type !== 'noteCard' && hit.type !== 'todoCard') return;
		// Persist the current canvas state before navigating away.
		if (isDirty()) {
			await onSaveClick();
			if (saveState === 'error') return;
		}
		const res = await postMessage({ type: 'openLinkedNote', noteId: hit.noteId });
		if (!res || !res.ok) {
			markCardBroken(hit.id, true);
			showError((res && res.error) || t('errorOpenLinkedNote', 'Failed to open linked note'));
		}
	}

	/**
	 * Opens the inline prompt with current text pre-filled. Updates the
	 * element on confirm; empty input and cancel are both no-ops, so the
	 * element can never silently disappear. Use Delete to remove it.
	 */
	function editTextElement(target) {
		openTextOverlayEditor(target, (nextText) => {
			if (nextText === target.text) return;
			updateTextValue(target.id, nextText);
		});
	}

	/**
	 * Opens an HTML <textarea> positioned over the element's bounding box,
	 * mapped through the SVG's screen CTM so zoom / scroll / viewBox are
	 * respected. The original SVG <text> node is hidden while editing so
	 * the user does not see two overlapping copies. Closes the editor on
	 * blur (save), Ctrl/Cmd+Enter (save) and Escape (cancel).
	 *
	 * `onCommit(nextText)` is invoked when the user keeps changes. The
	 * caller decides what to do with the value (update an existing element
	 * or insert a new one). Cancel and unchanged commits skip the callback.
	 */
	function openTextOverlayEditor(target, onCommit) {
		if (textEditor) closeTextOverlayEditor('cancel');

		const node = svg();
		if (!node) return;
		const ctm = node.getScreenCTM();
		if (!ctm) return;

		let focusHandle = null;

		// Map (x, y) and (x+width, y+height) document points to client space
		// via the SVG screen CTM. Using two points is more robust than
		// trusting ctm.a/d for non-uniform transforms.
		const topLeft = node.createSVGPoint();
		topLeft.x = target.x;
		topLeft.y = target.y;
		const br = node.createSVGPoint();
		br.x = target.x + target.width;
		br.y = target.y + target.height;
		const tlClient = topLeft.matrixTransform(ctm);
		const brClient = br.matrixTransform(ctm);

		const widthPx = Math.max(20, brClient.x - tlClient.x);
		const heightPx = Math.max(20, brClient.y - tlClient.y);
		// ctm.a holds the document-to-screen scale for the X axis (uniform
		// in our setup since we never apply rotation or shear).
		const pixelScale = ctm.a || 1;

		const ta = document.createElement('textarea');
		ta.value = target.text || '';
		ta.setAttribute('spellcheck', 'false');
		ta.setAttribute('wrap', 'soft');
		ta.setAttribute('style',
			'position:fixed;' +
			`left:${tlClient.x}px;top:${tlClient.y}px;` +
			`width:${widthPx}px;height:${heightPx}px;` +
			`font-size:${target.fontSize * pixelScale}px;` +
			'font-family:sans-serif;' +
			'line-height:1.2;' +
			'padding:0;margin:0;border:1px solid #4a90e2;' +
			'background:rgba(255,255,255,0.96);color:#222;' +
			'box-sizing:border-box;outline:none;resize:none;' +
			'overflow:hidden;z-index:9998;');
		document.body.appendChild(ta);

		textEditor = {
			elementId: target.id,
			originalText: target.text || '',
			textarea: ta,
			hiddenNode: null,
			onCommit: typeof onCommit === 'function' ? onCommit : null,
			focusHandle: null,
		};

		hideEditedTextNode(target.id);

		ta.addEventListener('keydown', onTextEditorKeyDown);
		ta.addEventListener('blur', onTextEditorBlur);

		focusHandle = setTimeout(() => {
			if (!textEditor || textEditor.textarea !== ta) return;
			textEditor.focusHandle = null;
			ta.focus();
			// Place caret at the end instead of selecting everything, so the
			// user can extend the text without an accidental overwrite.
			const len = ta.value.length;
			try { ta.setSelectionRange(len, len); } catch (_) { /* ignore */ }
		}, 0);
		textEditor.focusHandle = focusHandle;
	}

	function hideEditedTextNode(elementId) {
		if (!textEditor) return;
		const root = svg();
		if (!root) return;
		const escId = String(elementId).replace(/["\\]/g, '\\$&');
		const node = root.querySelector(`[data-element-id="${escId}"]`);
		if (node) {
			node.style.visibility = 'hidden';
			textEditor.hiddenNode = node;
		}
	}

	function onTextEditorKeyDown(evt) {
		if (evt.key === 'Escape') {
			evt.preventDefault();
			evt.stopPropagation();
			closeTextOverlayEditor('cancel');
			return;
		}
		if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
			evt.preventDefault();
			evt.stopPropagation();
			closeTextOverlayEditor('commit');
			return;
		}
		// Stop Delete/Backspace from bubbling to the canvas key handler.
		if (evt.key === 'Delete' || evt.key === 'Backspace') {
			evt.stopPropagation();
		}
	}

	function onTextEditorBlur() {
		// Blur after Escape already destroyed the editor.
		if (!textEditor) return;
		closeTextOverlayEditor('commit');
	}

	function closeTextOverlayEditor(reason) {
		if (!textEditor) return;
		const { originalText, textarea, hiddenNode, onCommit, focusHandle } = textEditor;
		const nextValue = textarea.value;
		// Detach listeners and pending timers before removing the node so
		// blur callbacks and the deferred focus call do not re-enter.
		if (focusHandle !== null) clearTimeout(focusHandle);
		textarea.removeEventListener('keydown', onTextEditorKeyDown);
		textarea.removeEventListener('blur', onTextEditorBlur);
		if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
		if (hiddenNode) hiddenNode.style.visibility = '';
		textEditor = null;

		if (reason === 'commit' && nextValue !== originalText && onCommit) {
			onCommit(nextValue);
		}
		// Make sure the user is back in Select mode after editing.
		if (activeTool !== 'select') setActiveTool('select');
	}

	function updateTextValue(elementId, nextText) {
		const changed = mapElement(elementId, (e) => {
			if (e.type !== 'text') return e;
			return Object.assign({}, e, { text: nextText });
		});
		if (!changed) return;
		markDirty();
		render();
	}

	function markCardBroken(elementId, broken) {
		let changed = false;
		doc = Object.assign({}, doc, {
			elements: doc.elements.map((e) => {
				if (e.id !== elementId) return e;
				if (!!e.broken === !!broken) return e;
				changed = true;
				return Object.assign({}, e, { broken: !!broken });
			}),
		});
		if (changed) {
			markDirty();
			render();
		}
	}

	async function validateLinkedCards() {
		if (!doc) return;
		const cards = doc.elements.filter((e) => e.type === 'noteCard' || e.type === 'todoCard');
		const ids = Array.from(new Set(cards.map((c) => c.noteId))).filter(Boolean);
		if (ids.length === 0) return;
		const res = await postMessage({ type: 'checkLinkedNotes', noteIds: ids });
		if (!res || !res.ok || !Array.isArray(res.statuses)) return;
		const byId = new Map(res.statuses.map((s) => [s.id, s]));

		let changed = false;
		const nextElements = doc.elements.map((e) => {
			if (e.type !== 'noteCard' && e.type !== 'todoCard') return e;
			const status = byId.get(e.noteId);
			if (!status) return e;
			let next = e;
			if (!status.exists) {
				if (!e.broken) { next = Object.assign({}, next, { broken: true }); changed = true; }
			} else {
				if (e.broken) { next = Object.assign({}, next, { broken: false }); changed = true; }
				if (typeof status.title === 'string' && status.title !== e.title) {
					next = Object.assign({}, next, { title: status.title }); changed = true;
				}
				if (typeof status.preview === 'string' && status.preview !== (e.preview || '')) {
					next = Object.assign({}, next, { preview: status.preview }); changed = true;
				}
				if (e.type === 'todoCard' && typeof status.todoCompleted === 'boolean'
						&& !!status.todoCompleted !== !!e.completed) {
					next = Object.assign({}, next, { completed: !!status.todoCompleted }); changed = true;
				}
			}
			return next;
		});
		if (changed) {
			doc = Object.assign({}, doc, { elements: nextElements });
			render();
			// Background sync, not a user edit -> do not touch saveState.
		}
	}

	// --- bootstrap ----------------------------------------------------------

	function buildCanvasFit() {
		const stage = $('canvas-stage');
		if (!stage || !CanvasFit) return null;
		return CanvasFit.createFit(stage, {
			getDoc: () => doc,
			applyResize: ({ width, height, changed }) => {
				if (!changed) return;
				doc = Object.assign({}, doc, { width, height });
				markDirty();
				render();
			},
		});
	}

	function bindToolbar() {
		const toolsHost = document.querySelector('[data-role="tools"]');
		if (!toolsHost) return;
		toolbarApi = Toolbar.mount(toolsHost, (toolId) => {
			activeTool = toolId;
			const node = svg();
			if (node) node.setAttribute('data-tool', toolId);
			if (toolId !== 'select' && selectedId !== null) {
				selectedId = null;
				refreshSelection();
			}
		});
	}

	function bindToolbarButtons() {
		const saveBtn = $('btn-save');
		if (saveBtn) saveBtn.addEventListener('click', onSaveClick);
		const delBtn = $('btn-delete');
		if (delBtn) delBtn.addEventListener('click', onDeleteClick);
		const addNoteBtn = $('btn-add-note');
		if (addNoteBtn) addNoteBtn.addEventListener('click', onAddNoteClick);

		const zoomIn = $('btn-zoom-in');
		if (zoomIn) zoomIn.addEventListener('click', () => setZoom(zoom * C.ZOOM_STEP));
		const zoomOut = $('btn-zoom-out');
		if (zoomOut) zoomOut.addEventListener('click', () => setZoom(zoom / C.ZOOM_STEP));
		const zoomReset = $('btn-zoom-reset');
		if (zoomReset) zoomReset.addEventListener('click', () => setZoom(1));

		const fontSmaller = $('btn-font-smaller');
		if (fontSmaller) fontSmaller.addEventListener('click', () => adjustSelectedTextFontSize(-TEXT_FONT_SIZE_STEP));
		const fontLarger = $('btn-font-larger');
		if (fontLarger) fontLarger.addEventListener('click', () => adjustSelectedTextFontSize(+TEXT_FONT_SIZE_STEP));
	}

	function bindCanvasEvents() {
		const node = svg();
		if (node) {
			node.setAttribute('data-tool', activeTool);
			node.addEventListener('pointerdown', onPointerDown);
			node.addEventListener('dblclick', onCanvasDoubleClick);
			node.addEventListener('contextmenu', onContextMenu);
		}
		// Listen on window so dragging the cursor outside the SVG keeps the
		// drag alive instead of stalling at the SVG boundary.
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);

		const stage = $('canvas-stage');
		if (stage) {
			stage.addEventListener('wheel', onWheel, { passive: false });
			// Prevent the browser's middle-click auto-scroll mode from kicking
			// in - it consumes pointermove/up and breaks our pan handler.
			stage.addEventListener('mousedown', (e) => {
				if (e.button === 1) e.preventDefault();
			});
		}

		// Hide context menu on any outside click.
		document.addEventListener('mousedown', (e) => {
			if (ContextMenu.isOpen() && !ContextMenu.contains(e.target)) ContextMenu.hide();
		});

		document.addEventListener('keydown', onKeyDown);
		document.addEventListener('keyup', onKeyUp);
		window.addEventListener('blur', () => { spaceDown = false; });
	}

	function bindBackendChannel() {
		if (typeof webviewApi !== 'undefined' && webviewApi.onMessage) {
			webviewApi.onMessage((event) => {
				const message = event && event.message !== undefined ? event.message : event;
				handleBackendMessage(message);
			});
		}
	}

	/**
	 * Joplin injects webview scripts via plain <script src>. DOMContentLoaded
	 * may have already fired by then, so we must not block bootstrap on it.
	 */
	function bootstrap() {
		console.info('[Canvas Notes] webview bootstrap');
		if (!Renderer || !Toolbar || !Geometry || !Handles || !Factories || !Transforms || !TempPreview || !ContextMenu || !C) {
			console.error('[Canvas Notes] webview dependencies missing');
			return;
		}

		bindToolbar();
		bindToolbarButtons();
		bindCanvasEvents();
		bindBackendChannel();

		canvasFit = buildCanvasFit();

		setStatus(t('statusReady', 'Ready'), 'idle');
		updateToolbar();
		postMessage({ type: 'ready' });
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
	} else {
		bootstrap();
	}
})();
