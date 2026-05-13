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
	const TEXT_DEFAULT_FONT_SIZE = 16;

	// Defaults and minimums for text-box geometry. Kept in sync with the
	// transforms module so drag-create and resize agree on bounds.
	const TEXT_DEFAULT_W = 200;
	const TEXT_DEFAULT_H = 80;
	const TEXT_MIN_W = 40;
	const TEXT_MIN_H = 24;

	/**
	 * Размер шрифта, который будет применён к следующему создаваемому
	 * текстовому элементу. Меняется кнопками A-/A+, когда нет ни
	 * выделенного текстового элемента, ни активного оверлей-редактора
	 * с конкретным таргетом. Это позволяет настраивать размер до того,
	 * как пользователь нарисует текстовый блок.
	 */
	let pendingTextFontSize = TEXT_DEFAULT_FONT_SIZE;

	function clampFontSize(v) {
		if (!Number.isFinite(v)) return TEXT_FONT_SIZE_MIN;
		return Math.max(TEXT_FONT_SIZE_MIN, Math.min(TEXT_FONT_SIZE_MAX, Math.round(v)));
	}

	function getSelectedTextElement() {
		if (!doc || !selectedId) return null;
		const el = doc.elements.find((e) => e.id === selectedId);
		return (el && el.type === 'text') ? el : null;
	}

	function findTextElement(elementId) {
		if (!doc || !elementId) return null;
		const el = doc.elements.find((e) => e.id === elementId);
		return (el && el.type === 'text') ? el : null;
	}

	/**
	 * Возвращает текущий эффективный размер шрифта для UI text-controls.
	 * Приоритет: выделенный text-элемент -> активный оверлей-редактор
	 * (включая черновик нового текста) -> pendingTextFontSize.
	 */
	function currentTextFontSize() {
		const sel = getSelectedTextElement();
		if (sel) return sel.fontSize || TEXT_DEFAULT_FONT_SIZE;
		if (textEditor) return textEditor.fontSize || TEXT_DEFAULT_FONT_SIZE;
		return pendingTextFontSize;
	}

	/**
	 * Правка размера текста. Работает в трёх режимах:
	 *   1. Открыт shapeLabel / lineLabel overlay - меняем fontSize
	 *      вложенного label в фигуре/линии.
	 *   2. Открыт text overlay (элемент в документе или черновик) -
	 *      меняем размер элемента и pendingTextFontSize.
	 *   3. Активного overlay нет но выбран text-элемент (когда
	 *      adjustTextFontSize вызван программно) - меняем его fontSize.
	 * Кнопки A-/A+ живут в плавающем popover рядом с editor;
	 * поэтому путь без overlay пользовательски недостижим, но
	 * поддерживается для внутренних вызовов.
	 */
	function adjustTextFontSize(delta) {
		const next = clampFontSize(currentTextFontSize() + delta);
		if (next === currentTextFontSize()) return;

		// Shape/line label editing: пишем в модель (label.fontSize) и
		// синхронизируем размер textarea. pendingTextFontSize не
		// трогаем — это прерогатива TextElement.
		if (textEditor && (textEditor.kind === 'shapeLabel' || textEditor.kind === 'lineLabel')) {
			textEditor.fontSize = next;
			setEmbeddedLabelFontSize(textEditor.elementId, textEditor.kind, next);
			syncTextEditorFontSize(textEditor.elementId, next);
			// Размер textarea в wrapper-режиме авторесайзится по
			// контенту; при смене fontSize это вызываем явно,
			// поскольку высота изменилась, а input-событие не случилось.
			autoResizeShapeLabelTextarea();
			refreshFontSizePopover();
			repositionFontSizePopover();
			return;
		}

		pendingTextFontSize = next;

		const sel = getSelectedTextElement();
		if (sel) {
			const changed = mapElement(sel.id, (e) =>
				Object.assign({}, e, { fontSize: next }));
			if (changed) {
				markDirty();
				render();
			}
		}

		if (textEditor) {
			textEditor.fontSize = next;
			// Если элемент оверлея уже есть в документе (редактирование, а
			// не создание черновика) - синхронизируем модель тоже.
			const editing = findTextElement(textEditor.elementId);
			if (editing && editing !== sel) {
				const changed = mapElement(editing.id, (e) =>
					Object.assign({}, e, { fontSize: next }));
				if (changed) {
					markDirty();
					render();
				}
			}
			syncTextEditorFontSize(textEditor.elementId, next);
		}

		refreshFontSizePopover();
		repositionFontSizePopover();
	}

	/**
	 * Пишет новый fontSize во вложенный label фигуры или линии.
	 * Общий helper для обоих киндов, логика одинаковая.
	 */
	function setEmbeddedLabelFontSize(elementId, kind, fontSize) {
		const defaults = kind === 'lineLabel' ? DEFAULT_LINE_LABEL : DEFAULT_SHAPE_LABEL;
		const matchType = (e) => kind === 'lineLabel'
			? (e.type === 'arrow' || e.type === 'line')
			: isLabeledShape(e.type);
		const changed = mapElement(elementId, (e) => {
			if (!matchType(e)) return e;
			const prev = e.label || defaults;
			if ((prev.fontSize || defaults.fontSize) === fontSize) return e;
			const nextLabel = Object.assign({}, defaults, prev, { fontSize });
			return Object.assign({}, e, { label: nextLabel });
		});
		if (!changed) return;
		markDirty();
		render();
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
			// Skip while the user is interacting with the canvas or editing
			// text inline. Without the textEditor guard, autosave would call
			// onSaveClick, which commits and closes the open editor mid-typing,
			// stealing focus and visually resetting the edit session.
			if (dragState || textEditor) { scheduleAutosave(); return; }
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

		updateEmptyState();
	}

	/**
	 * Floating font-size popover attached to the active textarea overlay.
	 * Replaces the old toolbar text-controls: A-/A+ and the current size
	 * float right next to the editor so the control is contextual and
	 * does not clutter the toolbar.
	 */
	let fontSizePopover = null;

	function openFontSizePopover() {
		closeFontSizePopover();
		if (!textEditor) return;

		const host = document.createElement('div');
		host.className = 'font-size-popover';
		host.setAttribute('role', 'group');
		host.setAttribute('aria-label', t('textControlsLabel', 'Text size'));

		const smaller = document.createElement('button');
		smaller.type = 'button';
		smaller.className = 'tool-btn';
		smaller.textContent = 'A-';
		smaller.title = t('btnFontSmaller', 'Smaller text');

		const value = document.createElement('span');
		value.className = 'font-size-value';
		value.setAttribute('aria-live', 'polite');

		const larger = document.createElement('button');
		larger.type = 'button';
		larger.className = 'tool-btn';
		larger.textContent = 'A+';
		larger.title = t('btnFontLarger', 'Larger text');

		// preventDefault на mousedown удерживает фокус в textarea, иначе
		// blur при клике по кнопке закрывает editor и popover исчезает.
		const keepFocus = (evt) => evt.preventDefault();
		smaller.addEventListener('mousedown', keepFocus);
		smaller.addEventListener('click', () => adjustTextFontSize(-TEXT_FONT_SIZE_STEP));
		larger.addEventListener('mousedown', keepFocus);
		larger.addEventListener('click', () => adjustTextFontSize(+TEXT_FONT_SIZE_STEP));

		host.appendChild(smaller);
		host.appendChild(value);
		host.appendChild(larger);
		document.body.appendChild(host);

		fontSizePopover = { host, smaller, larger, value };
		refreshFontSizePopover();
		repositionFontSizePopover();
	}

	function closeFontSizePopover() {
		if (!fontSizePopover) return;
		if (fontSizePopover.host.parentNode) {
			fontSizePopover.host.parentNode.removeChild(fontSizePopover.host);
		}
		fontSizePopover = null;
	}

	/** Updates the displayed size + button enablement. */
	function refreshFontSizePopover() {
		if (!fontSizePopover) return;
		const v = currentTextFontSize();
		fontSizePopover.value.textContent = String(v);
		fontSizePopover.smaller.disabled = v <= TEXT_FONT_SIZE_MIN;
		fontSizePopover.larger.disabled = v >= TEXT_FONT_SIZE_MAX;
	}

	/**
	 * Anchors the popover to the active editor: centered horizontally on
	 * the editor, placed above it if there is room, otherwise below.
	 * Re-runs after every autoresize and on window resize/scroll so the
	 * popover follows the editor faithfully.
	 */
	function repositionFontSizePopover() {
		if (!fontSizePopover || !textEditor) return;
		const anchor = textEditor.wrapper || textEditor.textarea;
		if (!anchor) return;
		const host = fontSizePopover.host;
		const rect = anchor.getBoundingClientRect();
		const hostRect = host.getBoundingClientRect();
		const gap = 6;
		let top = rect.top - hostRect.height - gap;
		if (top < gap) top = rect.bottom + gap;
		let left = rect.left + (rect.width - hostRect.width) / 2;
		// Кламп по вьюпорту, чтобы popover не уехал за края в крайних случаях.
		const vw = window.innerWidth;
		if (left < gap) left = gap;
		else if (left + hostRect.width > vw - gap) left = vw - hostRect.width - gap;
		host.style.left = `${left}px`;
		host.style.top = `${top}px`;
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

	function applyResize(elementId, handle, initial, p, opts) {
		doc = Object.assign({}, doc, {
			elements: doc.elements.map((e) =>
				(e.id === elementId ? Transforms.resizeElement(e, initial, handle, p, opts) : e)),
		});
	}

	/**
	 * Computes per-element resize options (min width/height) for the
	 * current resize gesture. For cards, the minimum width is the actual
	 * rendered title width (so the title never overflows the card on
	 * resize) capped at CARD_TITLE_MAX_RESIZE_W to keep long titles from
	 * blocking the user from shrinking the card.
	 */
	function computeResizeOpts(sel) {
		if (!sel) return null;
		if (sel.type !== 'noteCard' && sel.type !== 'todoCard') return null;
		const minW = computeCardMinWidth(sel);
		const minH = (C && C.CARD_MIN_HEIGHT) || 84;
		return { minW, minH };
	}

	/**
	 * Upper bound on the title-driven minimum width. Sized to fit a long
	 * title (~80 chars at 14px sans-serif) without clamping; past this
	 * point the title is shown with an ellipsis instead of blocking the
	 * user from shrinking the card further.
	 */
	const CARD_TITLE_MAX_RESIZE_W = 700;
	const CARD_TITLE_PAD_X = 10;
	const CARD_TITLE_FONT_SIZE = 14;
	// Must match AVG_CHAR_WIDTH_RATIO in src/canvas/textWrap.ts, which is
	// the heuristic clampTitleToWidth uses to decide where to truncate.
	// Using the same ratio here guarantees: at the computed minW the
	// display clamp accepts the full title, so the user never ends up
	// with both the resize minimum and an ellipsis at the same time.
	const CARD_TITLE_CHAR_WIDTH_RATIO = 0.6;

	function computeCardMinWidth(sel) {
		const baseMin = (C && C.CARD_MIN_WIDTH) || 160;
		const title = sel && sel.title ? String(sel.title) : '';
		if (!title) return baseMin;
		const innerW = Math.ceil(title.length * CARD_TITLE_FONT_SIZE * CARD_TITLE_CHAR_WIDTH_RATIO);
		const titleDriven = innerW + CARD_TITLE_PAD_X * 2;
		return Math.max(baseMin, Math.min(titleDriven, CARD_TITLE_MAX_RESIZE_W));
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
		// renderDocument пересоздаёт все SVG-узлы. Ссылки в hiddenNodes
		// указывают на удалённые элементы, а новый label-узел
		// остаётся видимым и накладывается на textarea. Переприменяем
		// скрытие по текущему редактору.
		if (textEditor) {
			textEditor.hiddenNodes = [];
			hideEditedTextNode(textEditor.elementId, textEditor.kind);
			repositionFontSizePopover();
		}
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
		// While the text overlay editor is active, clicking on the canvas
		// commits the current edit explicitly. We cannot rely on the
		// textarea's blur event because preventDefault'ing the canvas
		// pointerdown to suppress drag-start would also suppress focus
		// transfer - blur never fires and the user's typed text is lost.
		// Single-click on the canvas = commit + dismiss; subsequent
		// selection/move/drawing requires a new click.
		if (textEditor) {
			closeTextOverlayEditor('commit');
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
		// unavailable (defensive: keeps the editor working even if the
		// toolbar module fails to load).
		const toolKind = toolDef
			? toolDef.kind
			: (activeTool === 'select' ? 'select'
				: activeTool === 'pen' ? 'pen'
					: activeTool === 'text' ? 'text'
						: (activeTool === 'arrow' || activeTool === 'line') ? 'line'
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

		if (toolKind === 'shape') {
			// Drag-create gesture: a small drag (or plain click) yields a
			// default-sized shape centered on the click point; a real drag
			// produces a shape that exactly fills the user-drawn box. The
			// preview uses a dashed bbox rectangle (cheap, unambiguous) for
			// every shape kind including ellipse.
			dragState = {
				mode: 'shape-creating',
				shapeType: toolDef && toolDef.shapeType ? toolDef.shapeType : null,
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
					resizeOpts: computeResizeOpts(sel),
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
				applyResize(dragState.elementId, dragState.handle, dragState.initial, p, dragState.resizeOpts);
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
				TempPreview.showShape(svg(), dragState.start, p);
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
	 * Materializes the drag-created shape. A drag larger than the min
	 * threshold along both axes uses the user-drawn bounds; a smaller
	 * drag or plain click falls back to a default-sized shape centered
	 * on the click point. Mirrors text-create UX so single clicks remain
	 * useful.
	 */
	function finishShapeCreate(state) {
		if (!state.shapeType) return;
		const from = state.start;
		const to = state.current;
		const rawW = Math.abs(to.x - from.x);
		const rawH = Math.abs(to.y - from.y);
		const hasDraggedSize = rawW >= C.SHAPE_DRAG_MIN_SIZE && rawH >= C.SHAPE_DRAG_MIN_SIZE;

		if (hasDraggedSize) {
			const bounds = {
				x: Math.min(from.x, to.x),
				y: Math.min(from.y, to.y),
				width: rawW,
				height: rawH,
			};
			addElement(Factories.makeBoxFromBounds(state.shapeType, bounds, nextZ()));
		} else {
			addElement(Factories.makeBox(state.shapeType, from, nextZ()));
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
			{
				width: bounds.width,
				height: bounds.height,
				fontSize: clampFontSize(pendingTextFontSize),
			},
		);
		openTextOverlayEditor(draft, (nextText, snapshot) => {
			const trimmed = (nextText || '').replace(/^\s+|\s+$/g, '');
			if (trimmed.length === 0) return; // empty - drop the draft
			const fontSize = (snapshot && snapshot.fontSize) || draft.fontSize;
			addElement(Object.assign({}, draft, { text: nextText, fontSize }));
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
		picker.open(async (summary) => {
			if (!doc) return;
			// Picker returns a lean summary (no tags). Fetch the full one so
			// the new card is created with its tags already attached. On
			// failure fall back to the lean summary - the card will refresh
			// its tags on the next validateLinkedCards pass anyway.
			const full = await fetchFullNoteSummary(summary.id);
			const effective = full ? Object.assign({}, summary, full) : summary;
			const card = Factories.makeCardFromSummary(effective, defaultCardCenter(), nextZ());
			addElement(fitCardToTitle(card));
		});
	}

	/**
	 * Ensures a freshly created card is wide enough to render its full
	 * title without clamping. Applied at creation time so the user sees
	 * the correct width immediately, without having to drag a handle.
	 * The card is also re-centered around its original center so the
	 * extra width is distributed symmetrically.
	 */
	function fitCardToTitle(card) {
		if (!card || (card.type !== 'noteCard' && card.type !== 'todoCard')) return card;
		const minW = computeCardMinWidth(card);
		if (card.w >= minW) return card;
		const centerX = card.x + card.w / 2;
		return Object.assign({}, card, { x: centerX - minW / 2, w: minW });
	}

	async function fetchFullNoteSummary(noteId) {
		if (!noteId) return null;
		const res = await postMessage({ type: 'getNoteSummary', noteId });
		return res && res.ok && res.summary ? res.summary : null;
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

		if (isLabeledShape(hit.type)) {
			editShapeLabel(hit);
			return;
		}

		if (hit.type === 'arrow' || hit.type === 'line') {
			// Editing is anchored to the label itself, not the stroke -
			// matches draw.io behavior and avoids accidental editor opens
			// when the user just wants to grab/drag a labeled line. An empty
			// label still opens the editor so it stays reachable on first use.
			const hasLabel = !!(hit.label && hit.label.text);
			if (!hasLabel || Geometry.hitTestLineLabel(hit, p.x, p.y)) {
				editLineLabel(hit);
			}
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
	 * Predicate for element types whose embedded label can be edited via
	 * double-click. Matches the unified box-bounded shape model.
	 */
	const Types = window.CanvasNotes && window.CanvasNotes.Types;
	function isLabeledShape(type) {
		return !!(Types && Types.isShapeType && Types.isShapeType(type));
	}

	const DEFAULT_SHAPE_LABEL = {
		text: '',
		fontSize: 14,
		color: '#222222',
		align: 'center',
		verticalAlign: 'middle',
	};

	const DEFAULT_LINE_LABEL = {
		text: '',
		fontSize: 14,
		color: '#222222',
		position: 'center',
		orientation: 'parallel',
	};

	// Textarea size for line label editing, in document units.
	// Width is adaptive: for parallel-oriented labels we match the
	// available segment length so the user sees how text will wrap before
	// committing. Min/max clamp keeps the box usable on very short or
	// very long lines.
	const LINE_LABEL_EDIT_W_MIN = 120;
	const LINE_LABEL_EDIT_W_MAX = 400;
	const LINE_LABEL_EDIT_H = 60;

	/**
	 * Endpoint padding so the editor width matches the renderer's
	 * available-width calculation. Keep in sync with `lineLabelEndPad`
	 * in canvasRenderer.js / svgRenderers.ts.
	 */
	function lineLabelEditEndPad(strokeWidth) {
		return Math.max(20, strokeWidth * 4);
	}

	/**
	 * Bounding box used for label positioning. Mirrors labelBoxFor() on
	 * the renderer and serializer sides; negative-sized boxes (transient
	 * during drag-create) are normalized so the overlay lands on the
	 * visible quadrant.
	 */
	function shapeLabelBox(e) {
		if (!isLabeledShape(e.type)) return null;
		const x = e.w >= 0 ? e.x : e.x + e.w;
		const y = e.h >= 0 ? e.y : e.y + e.h;
		return { x, y, w: Math.abs(e.w), h: Math.abs(e.h) };
	}

	/**
	 * Opens the inline prompt with current text pre-filled. Updates the
	 * element on confirm; empty input and cancel are both no-ops, so the
	 * element can never silently disappear. Use Delete to remove it.
	 */
	function editTextElement(target) {
		const view = {
			kind: 'text',
			elementId: target.id,
			box: { x: target.x, y: target.y, w: target.width, h: target.height },
			originalText: target.text || '',
			fontSize: target.fontSize || TEXT_DEFAULT_FONT_SIZE,
			color: '#222',
			textAlign: 'left',
		};
		openTextOverlayEditor(view, (nextText) => {
			if (nextText === target.text) return;
			updateTextValue(target.id, nextText);
		});
	}

	/**
	 * Opens the textarea overlay anchored to the bounds of a shape so the
	 * user can edit its embedded label. The shape itself stays visible -
	 * only the rendered <text> label is hidden for the duration of the
	 * edit so two copies of the text do not overlap.
	 */
	function editShapeLabel(target) {
		const box = shapeLabelBox(target);
		if (!box) return;
		const label = target.label || DEFAULT_SHAPE_LABEL;

		// Компактный overlay-бокс вокруг центра фигуры, как у line label.
		// Растягивать textarea на весь bbox нельзя: фигуры сложной
		// формы (cloud, callout) имеют bbox сильно больше видимой области,
		// и прямоугольный textarea перекрывает всю фигуру.
		const minW = 120;
		const maxW = 400;
		// 90% от ширины bbox - небольшой внутренний зазор для визуального
		// разделения overlay и границ фигуры.
		const w = Math.max(minW, Math.min(maxW, box.w * 0.9));
		const h = 60;
		const cx = box.x + box.w / 2;
		const cy = box.y + box.h / 2;

		const view = {
			kind: 'shapeLabel',
			elementId: target.id,
			box: { x: cx - w / 2, y: cy - h / 2, w, h },
			originalText: label.text || '',
			fontSize: label.fontSize || DEFAULT_SHAPE_LABEL.fontSize,
			color: label.color || DEFAULT_SHAPE_LABEL.color,
			textAlign: label.align === 'left' ? 'left'
				: (label.align === 'right' ? 'right' : 'center'),
			verticalAlign: label.verticalAlign || DEFAULT_SHAPE_LABEL.verticalAlign,
		};
		openTextOverlayEditor(view, (nextText) => {
			const nextLabelText = nextText || '';
			if (nextLabelText === (label.text || '')) return;
			updateShapeLabelText(target.id, nextLabelText);
		});
	}

	/**
	 * Opens the textarea overlay centered on a line/arrow midpoint so the
	 * user can edit its embedded label. Uses a fixed-size overlay box
	 * centered on the segment midpoint - lines have no inherent rectangle
	 * to anchor to.
	 */
	function editLineLabel(target) {
		const label = target.label || DEFAULT_LINE_LABEL;
		const cx = (target.from.x + target.to.x) / 2;
		const cy = (target.from.y + target.to.y) / 2;

		// Width matches the renderer's available-along-the-line budget so
		// what the user types maps directly to how the label will wrap.
		// Clamped so the editor is usable on extreme line lengths.
		const dx = target.to.x - target.from.x;
		const dy = target.to.y - target.from.y;
		const length = Math.hypot(dx, dy);
		const endPad = lineLabelEditEndPad(target.strokeWidth || 1);
		const available = Math.max(1, length - endPad * 2);
		const w = Math.max(LINE_LABEL_EDIT_W_MIN, Math.min(LINE_LABEL_EDIT_W_MAX, available));

		const view = {
			kind: 'lineLabel',
			elementId: target.id,
			box: {
				x: cx - w / 2,
				y: cy - LINE_LABEL_EDIT_H / 2,
				w,
				h: LINE_LABEL_EDIT_H,
			},
			originalText: label.text || '',
			fontSize: label.fontSize || DEFAULT_LINE_LABEL.fontSize,
			color: label.color || DEFAULT_LINE_LABEL.color,
			textAlign: 'center',
			verticalAlign: 'middle',
		};
		openTextOverlayEditor(view, (nextText) => {
			const nextLabelText = nextText || '';
			if (nextLabelText === (label.text || '')) return;
			updateLineLabelText(target.id, nextLabelText);
		});
	}

	/**
	 * Opens an HTML <textarea> positioned over a document-space box,
	 * mapped through the SVG's screen CTM so zoom / scroll / viewBox are
	 * respected. Closes on blur (commit), Ctrl/Cmd+Enter (commit) and
	 * Escape (cancel).
	 *
	 * `view` describes WHAT to edit:
	 *   - kind:           'text' | 'shapeLabel'
	 *   - elementId:      id of the SVG node to hide while editing
	 *   - box:            { x, y, w, h } in document space
	 *   - originalText:   pre-filled value, used to detect changes
	 *   - fontSize:       font size in document units
	 *   - color:          textarea text color (hex/rgba)
	 *   - textAlign:      'left' | 'center' | 'right'
	 *
	 * The overlay background is always transparent; the underlying SVG
	 * stays visible while the original text node is hidden via
	 * hideEditedTextNode for the duration of the edit.
	 *
	 * `onCommit(nextText, { fontSize })` is invoked only when the user
	 * keeps changes. Cancel and unchanged commits skip the callback.
	 */
	/** Maps a vertical-align name onto a flexbox align-items value. */
	function flexAlignFor(vAlign) {
		if (vAlign === 'top') return 'flex-start';
		if (vAlign === 'bottom') return 'flex-end';
		return 'center';
	}

	function openTextOverlayEditor(view, onCommit) {
		if (textEditor) closeTextOverlayEditor('cancel');

		const node = svg();
		if (!node) return;
		const ctm = node.getScreenCTM();
		if (!ctm) return;

		let focusHandle = null;

		// Map (x, y) and (x+w, y+h) document points to client space via the
		// SVG screen CTM. Using two points is more robust than trusting
		// ctm.a / ctm.d for non-uniform transforms.
		const topLeft = node.createSVGPoint();
		topLeft.x = view.box.x;
		topLeft.y = view.box.y;
		const br = node.createSVGPoint();
		br.x = view.box.x + view.box.w;
		br.y = view.box.y + view.box.h;
		const tlClient = topLeft.matrixTransform(ctm);
		const brClient = br.matrixTransform(ctm);

		const widthPx = Math.max(20, brClient.x - tlClient.x);
		const heightPx = Math.max(20, brClient.y - tlClient.y);
		// ctm.a holds the document-to-screen scale for the X axis (uniform
		// in our setup since we never apply rotation or shear).
		const pixelScale = ctm.a || 1;

		const ta = document.createElement('textarea');
		ta.value = view.originalText || '';
		ta.setAttribute('spellcheck', 'false');
		ta.setAttribute('wrap', 'soft');

		// Editor всегда прозрачный: под ним видна фигура/линия/фон,
		// а оригин��льный текст скрыт через hideEditedTextNode. Рамка
		// 1px solid #4a90e2 обозначает активную область редактирования.
		let wrapper = null;
		const useWrapper = view.kind === 'shapeLabel' || view.kind === 'lineLabel';
		const wrapperCenterClientY = tlClient.y + heightPx / 2;
		if (useWrapper) {
			// Shape and line labels are centered inside their reference box.
			// A flexbox wrapper handles vertical alignment; the textarea
			// auto-grows in height based on its content. The wrapper grows
			// symmetrically around the original center so the editable block
			// stays anchored to the label's anchor point while typing.
			wrapper = document.createElement('div');
			wrapper.setAttribute('style',
				'position:fixed;' +
				`left:${tlClient.x}px;top:${tlClient.y}px;` +
				`width:${widthPx}px;height:${heightPx}px;` +
				'display:flex;justify-content:center;' +
				`align-items:${flexAlignFor(view.verticalAlign)};` +
				'background:transparent;' +
				'border:1px solid #4a90e2;border-radius:2px;' +
				'box-sizing:border-box;overflow:visible;z-index:9998;');

			ta.setAttribute('style',
				'width:100%;' +
				`font-size:${view.fontSize * pixelScale}px;` +
				'font-family:sans-serif;line-height:1.2;' +
				`text-align:${view.textAlign};` +
				`color:${view.color};background:transparent;` +
				'padding:2px 4px;margin:0;' +
				'border:none;outline:none;resize:none;' +
				'box-sizing:border-box;overflow:hidden;');
			wrapper.appendChild(ta);
			document.body.appendChild(wrapper);
		} else {
			// TextElement editor: full-bbox textarea, no flex centering.
			ta.setAttribute('style',
				'position:fixed;' +
				`left:${tlClient.x}px;top:${tlClient.y}px;` +
				`width:${widthPx}px;height:${heightPx}px;` +
				`font-size:${view.fontSize * pixelScale}px;` +
				'font-family:sans-serif;line-height:1.2;' +
				`text-align:${view.textAlign};` +
				'padding:2px 4px;margin:0;' +
				'border:1px solid #4a90e2;border-radius:2px;' +
				`background:transparent;color:${view.color};` +
				'box-sizing:border-box;outline:none;resize:none;' +
				'overflow:hidden;z-index:9998;');
			document.body.appendChild(ta);
		}

		textEditor = {
			kind: view.kind,
			elementId: view.elementId,
			originalText: view.originalText || '',
			fontSize: view.fontSize || TEXT_DEFAULT_FONT_SIZE,
			textarea: ta,
			wrapper,
			hiddenNodes: [],
			onCommit: typeof onCommit === 'function' ? onCommit : null,
			focusHandle: null,
			centerClientY: wrapperCenterClientY,
		};

		hideEditedTextNode(view.elementId, view.kind);
		openFontSizePopover();

		ta.addEventListener('keydown', onTextEditorKeyDown);
		ta.addEventListener('blur', onTextEditorBlur);

		// Auto-grow the label textarea so the centered text block expands
		// downward as the user types and stays vertically centered.
		// repositionFontSizePopover keeps the floating size control glued
		// to the editor as it grows / shrinks.
		if (useWrapper) {
			ta.addEventListener('input', () => {
				autoResizeShapeLabelTextarea();
				repositionFontSizePopover();
			});
			autoResizeShapeLabelTextarea();
			repositionFontSizePopover();
		}

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

	/**
	 * Resizes the shape/line label editor to fit its content. The textarea
	 * collapses to exactly its content height (no minimum floor), and the
	 * wrapper is re-anchored around the original midpoint so the first
	 * line of the editable text lands on the same baseline the rendered
	 * label uses. Without this exact fit, an empty textarea would be
	 * taller than its single visible line and the text would appear
	 * offset upwards compared to its final on-canvas position.
	 */
	function autoResizeShapeLabelTextarea() {
		if (!textEditor) return;
		if (textEditor.kind !== 'shapeLabel' && textEditor.kind !== 'lineLabel') return;
		const ta = textEditor.textarea;
		const wrapper = textEditor.wrapper;
		if (!wrapper) return;

		// Measure intrinsic content height of the textarea exactly.
		ta.style.height = 'auto';
		const nextH = ta.scrollHeight;
		ta.style.height = `${nextH}px`;
		wrapper.style.height = `${nextH}px`;
		// Re-anchor: keep the wrapper visually centered on its original
		// midpoint so growth/shrink happens symmetrically (half up, half down)
		// and the first line stays glued to the label's anchor point.
		wrapper.style.top = `${textEditor.centerClientY - nextH / 2}px`;
	}

	/**
	 * Hides the on-canvas representation of the element being edited so
	 * the textarea is not visually duplicated by the rendered text.
	 *  - 'text': hides the whole element node;
	 *  - 'shapeLabel': hides only the <text data-shape-label> child;
	 *  - 'lineLabel': hides the label backdrop + text children, but keeps
	 *    the line itself visible so the user sees what they are labeling.
	 *
	 * Multiple sub-nodes can be hidden at once; they are tracked in
	 * textEditor.hiddenNodes and restored on close.
	 */
	function hideEditedTextNode(elementId, kind) {
		if (!textEditor) return;
		const root = svg();
		if (!root) return;
		const escId = String(elementId).replace(/["\\]/g, '\\$&');
		const node = root.querySelector(`[data-element-id="${escId}"]`);
		if (!node) return;

		const hideAll = (selector) => {
			const found = node.querySelectorAll(selector);
			for (const n of found) {
				n.style.visibility = 'hidden';
				textEditor.hiddenNodes.push(n);
			}
		};

		if (kind === 'shapeLabel') {
			hideAll('[data-shape-label="1"]');
			return;
		}
		if (kind === 'lineLabel') {
			hideAll('[data-line-label="1"], [data-line-label-bg="1"]');
			return;
		}
		node.style.visibility = 'hidden';
		textEditor.hiddenNodes.push(node);
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
		const { originalText, textarea, wrapper, hiddenNodes, onCommit, focusHandle, fontSize } = textEditor;
		const nextValue = textarea.value;
		// Detach listeners and pending timers before removing the node so
		// blur callbacks and the deferred focus call do not re-enter.
		if (focusHandle !== null) clearTimeout(focusHandle);
		textarea.removeEventListener('keydown', onTextEditorKeyDown);
		textarea.removeEventListener('blur', onTextEditorBlur);
		// input-listener был привязан анонимной функцией; removeEventListener
		// не нужен, т.к. сам textarea удаляется из DOM и GC заберёт связанные
		// листенеры.
		closeFontSizePopover();
		// Shape-label editor uses a wrapper div; remove the wrapper (which
		// also detaches the textarea). Plain TextElement editor has no
		// wrapper - remove the textarea directly.
		const toRemove = wrapper || textarea;
		if (toRemove && toRemove.parentNode) toRemove.parentNode.removeChild(toRemove);
		for (const n of (hiddenNodes || [])) n.style.visibility = '';
		textEditor = null;

		if (reason === 'commit' && nextValue !== originalText && onCommit) {
			onCommit(nextValue, { fontSize });
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

	/**
	 * Writes a new label.text into a line/arrow element. Mirrors
	 * updateShapeLabelText but uses the line-label default schema.
	 */
	function updateLineLabelText(elementId, nextText) {
		const changed = mapElement(elementId, (e) => {
			if (e.type !== 'arrow' && e.type !== 'line') return e;
			const prev = e.label || DEFAULT_LINE_LABEL;
			if ((prev.text || '') === (nextText || '')) return e;
			const nextLabel = Object.assign({}, DEFAULT_LINE_LABEL, prev, { text: nextText || '' });
			return Object.assign({}, e, { label: nextLabel });
		});
		if (!changed) return;
		markDirty();
		render();
	}

	/**
	 * Writes a new label.text into a shape element. Defaults are filled
	 * in for old documents that lacked a label sub-object - this also
	 * future-proofs against hand-edited JSON.
	 */
	function updateShapeLabelText(elementId, nextText) {
		const changed = mapElement(elementId, (e) => {
			if (!isLabeledShape(e.type)) return e;
			const prev = e.label || DEFAULT_SHAPE_LABEL;
			if ((prev.text || '') === (nextText || '')) return e;
			const nextLabel = Object.assign({}, DEFAULT_SHAPE_LABEL, prev, { text: nextText || '' });
			return Object.assign({}, e, { label: nextLabel });
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

	function sameTags(a, b) {
		const left = Array.isArray(a) ? a : [];
		const right = Array.isArray(b) ? b : [];
		if (left.length !== right.length) return false;
		for (let i = 0; i < left.length; i++) {
			if (left[i] !== right[i]) return false;
		}
		return true;
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
				if (Array.isArray(status.tags) && !sameTags(status.tags, e.tags)) {
					next = Object.assign({}, next, { tags: status.tags.slice() }); changed = true;
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

		// Floating font-size popover follows the active editor: keep it
		// glued through window resize and stage scroll.
		window.addEventListener('resize', repositionFontSizePopover);
		const stageForScroll = $('canvas-stage');
		if (stageForScroll) {
			stageForScroll.addEventListener('scroll', repositionFontSizePopover);
		}
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
