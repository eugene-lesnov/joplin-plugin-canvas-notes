/* eslint-disable no-undef */
/**
 * Toolbar UI for the Canvas Editor webview.
 *
 * Builds icon-only tool buttons (with a tooltip for accessibility),
 * tracks the active tool and notifies the editor via callback.
 *
 * Icons are inline SVG strings - no asset files, no font dependencies,
 * no network calls. Each icon is a 16x16 viewBox shape.
 *
 * Exposed as global CanvasNotes.Toolbar.
 */

(function () {
	'use strict';

	function t(key, fallback) {
		const i18n = window.CanvasNotes && window.CanvasNotes.t;
		return typeof i18n === 'function' ? i18n(key) : fallback;
	}

	const ICON_SELECT =
		`<svg viewBox="0 0 16 16" aria-hidden="true">` +
			`<path d="M3 2 L13 8 L8 9 L11 14 L9 15 L6 10 L3 13 Z"/>` +
		`</svg>`;
	const ICON_SQUARE =
		`<svg viewBox="0 0 16 16" aria-hidden="true">` +
			`<rect x="3.5" y="3.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.5"/>` +
		`</svg>`;
	const ICON_CIRCLE =
		`<svg viewBox="0 0 16 16" aria-hidden="true">` +
			`<circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/>` +
		`</svg>`;
	const ICON_ARROW =
		`<svg viewBox="0 0 16 16" aria-hidden="true">` +
			`<path d="M2 13 L13 3 M13 3 L8 3 M13 3 L13 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
		`</svg>`;
	const ICON_LINE =
		`<svg viewBox="0 0 16 16" aria-hidden="true">` +
			`<path d="M2 13 L14 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
		`</svg>`;
	// Wavy/squiggly stroke that reads as a freehand line.
	const ICON_PEN =
    	`<svg viewBox="0 0 16 16" aria-hidden="true">` +
    		`<path d="M2 11.5 ` +
    			`C3.2 7.2, 5.1 6.8, 6.4 9.2 ` +
    			`S9.1 12.1, 10.1 8.6 ` +
    			`S12.2 3.9, 14 5.2" ` +
    			`fill="none" ` +
    			`stroke="currentColor" ` +
    			`stroke-width="1.6" ` +
    			`stroke-linecap="round" ` +
    			`stroke-linejoin="round"/>` +
    	`</svg>`;
	// Stylized capital "T" so the tool reads as a text-insertion tool.
	const ICON_TEXT =
		`<svg viewBox="0 0 16 16" aria-hidden="true">` +
			`<path d="M3 3 H13 M8 3 V13" ` +
			`fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` +
		`</svg>`;

	const TOOLS = [
		{ id: 'select', labelKey: 'toolSelect', fallback: 'Select', icon: ICON_SELECT },
		{ id: 'square', labelKey: 'toolSquare', fallback: 'Square', icon: ICON_SQUARE },
		{ id: 'circle', labelKey: 'toolCircle', fallback: 'Circle', icon: ICON_CIRCLE },
		{ id: 'line',   labelKey: 'toolLine',   fallback: 'Line',   icon: ICON_LINE },
		{ id: 'arrow',  labelKey: 'toolArrow',  fallback: 'Arrow',  icon: ICON_ARROW },
		{ id: 'pen',    labelKey: 'toolPen',    fallback: 'Pen',    icon: ICON_PEN },
		{ id: 'text',   labelKey: 'toolText',   fallback: 'Text',   icon: ICON_TEXT },
	];

	const DEFAULT_TOOL = 'select';

	function mount(host, onToolChange) {
		host.innerHTML = '';
		const buttons = new Map();
		let active = DEFAULT_TOOL;

		for (const tool of TOOLS) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'tool-btn icon-btn';
			btn.dataset.tool = tool.id;
			const label = t(tool.labelKey, tool.fallback);
			btn.title = label;
			btn.setAttribute('aria-label', label);
			btn.innerHTML = tool.icon;
			btn.addEventListener('click', () => setActive(tool.id));
			host.appendChild(btn);
			buttons.set(tool.id, btn);
		}

		function setActive(id) {
			if (!buttons.has(id)) return;
			active = id;
			for (const [tid, btn] of buttons.entries()) {
				btn.classList.toggle('active', tid === id);
			}
			if (typeof onToolChange === 'function') onToolChange(id);
		}

		setActive(active);

		return { getActive: () => active, setActive };
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.Toolbar = { TOOLS, DEFAULT_TOOL, mount };
})();
