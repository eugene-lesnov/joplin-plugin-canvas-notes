/* eslint-disable no-undef */
/**
 * Toolbar UI for the Canvas Editor webview.
 *
 * Builds icon-only tool buttons grouped by purpose (Select / Basic shapes
 * / Diagram shapes / Lines / Freehand / Text). Groups are separated by a
 * thin vertical divider so the toolbar stays compact and readable even
 * with the expanded toolset.
 *
 * Tool model:
 *   - id           - canonical tool id used by the editor controller and
 *                    `STICKY_TOOLS` membership;
 *   - kind         - what is created on canvas:
 *                      'select' | 'shape' | 'legacy' | 'line' | 'pen' | 'text';
 *   - shapeType    - ShapeKind for kind === 'shape';
 *   - lineSpec     - { type, strokeStyle, startArrow, endArrow } for kind === 'line'.
 *
 * Icons are inline SVG strings (viewBox 0 0 16 16, currentColor). No
 * external assets and no icon library.
 *
 * Exposed as global CanvasNotes.Toolbar.
 */

(function () {
	'use strict';

	function t(key, fallback) {
		const i18n = window.CanvasNotes && window.CanvasNotes.t;
		return typeof i18n === 'function' ? i18n(key) : fallback;
	}

	// ---- icons ------------------------------------------------------------

	function svg(inner) {
		return `<svg viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
	}

	const NONE_FILL = 'fill="none"';
	const STROKE = 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

	const ICON_SELECT = svg(`<path d="M3 2 L13 8 L8 9 L11 14 L9 15 L6 10 L3 13 Z"/>`);
	const ICON_SQUARE = svg(`<rect x="3.5" y="3.5" width="9" height="9" ${NONE_FILL} ${STROKE}/>`);
	const ICON_CIRCLE = svg(`<circle cx="8" cy="8" r="5" ${NONE_FILL} ${STROKE}/>`);
	const ICON_TRIANGLE = svg(`<polygon points="8,3 13.5,13 2.5,13" ${NONE_FILL} ${STROKE}/>`);
	const ICON_DIAMOND = svg(`<polygon points="8,2.5 13.5,8 8,13.5 2.5,8" ${NONE_FILL} ${STROKE}/>`);
	const ICON_PARALLELOGRAM = svg(`<polygon points="5,3 14,3 11,13 2,13" ${NONE_FILL} ${STROKE}/>`);
	const ICON_HEXAGON = svg(`<polygon points="5.5,3 10.5,3 13.5,8 10.5,13 5.5,13 2.5,8" ${NONE_FILL} ${STROKE}/>`);
	const ICON_CYLINDER = svg(
		`<path d="M3 5 V11 C3 12.3 5.2 13 8 13 C10.8 13 13 12.3 13 11 V5" ${NONE_FILL} ${STROKE}/>` +
		`<ellipse cx="8" cy="5" rx="5" ry="2" ${NONE_FILL} ${STROKE}/>`,
	);
	const ICON_CLOUD = svg(
		`<path d="M4 11 C2.5 11 2.5 8.5 4 8.5 C4 6 7 6 7.5 8 C8 6.5 11 6.5 11 9 C12.5 9 12.5 11 11 11 Z" ${NONE_FILL} ${STROKE}/>`,
	);
	const ICON_CARD = svg(
		`<polygon points="3,3 11,3 13,5 13,13 3,13" ${NONE_FILL} ${STROKE}/>` +
		`<polyline points="11,3 11,5 13,5" ${NONE_FILL} ${STROKE}/>`,
	);
	const ICON_CALLOUT = svg(
		`<path d="M3 3 H13 V11 H6 L4 14 V11 H3 Z" ${NONE_FILL} ${STROKE}/>`,
	);
	const ICON_DOCUMENT = svg(
		`<path d="M3 3 H13 V11 C11 13 9 10 6.5 12 C5 13 4 11.5 3 11.5 Z" ${NONE_FILL} ${STROKE}/>`,
	);
	const ICON_LINE = svg(`<path d="M2 13 L14 3" ${NONE_FILL} ${STROKE}/>`);
	const ICON_ARROW = svg(`<path d="M2 13 L13 3 M13 3 L8 3 M13 3 L13 8" ${NONE_FILL} ${STROKE}/>`);
	const ICON_BIARROW = svg(
		`<path d="M2 8 L14 8" ${NONE_FILL} ${STROKE}/>` +
		`<path d="M5 5 L2 8 L5 11" ${NONE_FILL} ${STROKE}/>` +
		`<path d="M11 5 L14 8 L11 11" ${NONE_FILL} ${STROKE}/>`,
	);
	const ICON_LINE_DASHED = svg(`<path d="M2 13 L14 3" ${NONE_FILL} ${STROKE} stroke-dasharray="3 2"/>`);
	const ICON_LINE_DOTTED = svg(`<path d="M2 13 L14 3" ${NONE_FILL} ${STROKE} stroke-dasharray="1 2.2"/>`);
	const ICON_PEN = svg(
		`<path d="M2 11.5 C3.2 7.2, 5.1 6.8, 6.4 9.2 S9.1 12.1, 10.1 8.6 S12.2 3.9, 14 5.2" ${NONE_FILL} ${STROKE}/>`,
	);
	const ICON_TEXT = svg(`<path d="M3 3 H13 M8 3 V13" ${NONE_FILL} stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);

	// ---- tool definitions ------------------------------------------------

	/**
	 * Tool catalog grouped by purpose. The editor controller reads `kind`
	 * and the kind-specific fields to decide which factory to call on
	 * pointer-up. Keep ids stable - they appear in saved documents only
	 * indirectly (via STICKY_TOOLS and the active-tool state).
	 */
	const TOOLS = [
		// Select
		{ id: 'select', group: 'select', kind: 'select',
		  labelKey: 'toolSelect', fallback: 'Select', icon: ICON_SELECT },

		// Basic shapes
		{ id: 'square', group: 'basic', kind: 'legacy',
		  labelKey: 'toolSquare', fallback: 'Rectangle', icon: ICON_SQUARE },
		{ id: 'circle', group: 'basic', kind: 'legacy',
		  labelKey: 'toolCircle', fallback: 'Ellipse', icon: ICON_CIRCLE },
		{ id: 'triangle', group: 'basic', kind: 'shape', shapeType: 'triangle',
		  labelKey: 'toolTriangle', fallback: 'Triangle', icon: ICON_TRIANGLE },
		{ id: 'diamond', group: 'basic', kind: 'shape', shapeType: 'diamond',
		  labelKey: 'toolDiamond', fallback: 'Diamond', icon: ICON_DIAMOND },
		{ id: 'parallelogram', group: 'basic', kind: 'shape', shapeType: 'parallelogram',
		  labelKey: 'toolParallelogram', fallback: 'Parallelogram', icon: ICON_PARALLELOGRAM },
		{ id: 'hexagon', group: 'basic', kind: 'shape', shapeType: 'hexagon',
		  labelKey: 'toolHexagon', fallback: 'Hexagon', icon: ICON_HEXAGON },

		// IT/diagram shapes
		{ id: 'cylinder', group: 'diagram', kind: 'shape', shapeType: 'cylinder',
		  labelKey: 'toolCylinder', fallback: 'Cylinder / Database', icon: ICON_CYLINDER },
		{ id: 'cloud', group: 'diagram', kind: 'shape', shapeType: 'cloud',
		  labelKey: 'toolCloud', fallback: 'Cloud', icon: ICON_CLOUD },
		{ id: 'card-shape', group: 'diagram', kind: 'shape', shapeType: 'card',
		  labelKey: 'toolCardShape', fallback: 'Card', icon: ICON_CARD },
		{ id: 'callout', group: 'diagram', kind: 'shape', shapeType: 'callout',
		  labelKey: 'toolCallout', fallback: 'Callout', icon: ICON_CALLOUT },
		{ id: 'document', group: 'diagram', kind: 'shape', shapeType: 'document',
		  labelKey: 'toolDocument', fallback: 'Document', icon: ICON_DOCUMENT },

		// Lines
		{ id: 'line', group: 'line', kind: 'line',
		  lineSpec: { type: 'line', strokeStyle: 'solid', startArrow: 'none', endArrow: 'none' },
		  labelKey: 'toolLine', fallback: 'Line', icon: ICON_LINE },
		{ id: 'arrow', group: 'line', kind: 'line',
		  lineSpec: { type: 'arrow', strokeStyle: 'solid', startArrow: 'none', endArrow: 'arrow' },
		  labelKey: 'toolArrow', fallback: 'Arrow', icon: ICON_ARROW },
		{ id: 'biarrow', group: 'line', kind: 'line',
		  lineSpec: { type: 'arrow', strokeStyle: 'solid', startArrow: 'arrow', endArrow: 'arrow' },
		  labelKey: 'toolBiArrow', fallback: 'Bidirectional arrow', icon: ICON_BIARROW },
		{ id: 'line-dashed', group: 'line', kind: 'line',
		  lineSpec: { type: 'line', strokeStyle: 'dashed', startArrow: 'none', endArrow: 'none' },
		  labelKey: 'toolLineDashed', fallback: 'Dashed line', icon: ICON_LINE_DASHED },
		{ id: 'line-dotted', group: 'line', kind: 'line',
		  lineSpec: { type: 'line', strokeStyle: 'dotted', startArrow: 'none', endArrow: 'none' },
		  labelKey: 'toolLineDotted', fallback: 'Dotted line', icon: ICON_LINE_DOTTED },

		// Freehand
		{ id: 'pen', group: 'pen', kind: 'pen',
		  labelKey: 'toolPen', fallback: 'Pen', icon: ICON_PEN },

		// Text
		{ id: 'text', group: 'text', kind: 'text',
		  labelKey: 'toolText', fallback: 'Text', icon: ICON_TEXT },
	];

	const DEFAULT_TOOL = 'select';
	const TOOL_BY_ID = new Map(TOOLS.map((t) => [t.id, t]));
	/** Group order on the toolbar from left to right. */
	const GROUP_ORDER = ['select', 'basic', 'diagram', 'line', 'pen', 'text'];

	function getToolDef(id) { return TOOL_BY_ID.get(id) || null; }

	// ---- DOM construction ------------------------------------------------

	function mount(host, onToolChange) {
		host.innerHTML = '';
		const buttons = new Map();
		let active = DEFAULT_TOOL;

		// Group tools, then render group-by-group with a separator in between.
		const byGroup = new Map();
		for (const tool of TOOLS) {
			if (!byGroup.has(tool.group)) byGroup.set(tool.group, []);
			byGroup.get(tool.group).push(tool);
		}

		let isFirstGroup = true;
		for (const group of GROUP_ORDER) {
			const tools = byGroup.get(group);
			if (!tools || tools.length === 0) continue;
			if (!isFirstGroup) {
				const sep = document.createElement('span');
				sep.className = 'toolbar-tools-separator';
				sep.setAttribute('aria-hidden', 'true');
				host.appendChild(sep);
			}
			isFirstGroup = false;

			for (const tool of tools) {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'tool-btn icon-btn';
				btn.dataset.tool = tool.id;
				btn.dataset.group = tool.group;
				const label = t(tool.labelKey, tool.fallback);
				btn.title = label;
				btn.setAttribute('aria-label', label);
				btn.innerHTML = tool.icon;
				btn.addEventListener('click', () => setActive(tool.id));
				host.appendChild(btn);
				buttons.set(tool.id, btn);
			}
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
	window.CanvasNotes.Toolbar = { TOOLS, DEFAULT_TOOL, mount, getToolDef };
})();
