/* eslint-disable no-undef */
/**
 * Toolbar UI for the Canvas Editor webview.
 *
 * Top-level layout (Figma-style compact toolbar):
 *
 *   [Select] | [Shapes ▼] [Lines ▼] | [Pen] [Text]
 *
 * - Shapes and Lines are split-button dropdowns. The icon shows the last
 *   tool picked from that group; clicking the caret (or the entire button
 *   when the group's current tool is already active) opens a popover with
 *   the full palette grouped into sub-sections.
 * - Active tool is highlighted both on the dropdown button (when it
 *   belongs to that group) and inside the open popover.
 *
 * Tool model:
 *   - id           - canonical tool id used by the editor controller;
 *   - kind         - 'select' | 'shape' | 'legacy' | 'line' | 'pen' | 'text';
 *   - shapeType    - ShapeKind for kind === 'shape';
 *   - lineSpec     - { type, strokeStyle, startArrow, endArrow } for 'line'.
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

	const NF = 'fill="none"';
	const ST = 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

	const ICON_SELECT = svg(`<path d="M3 2 L13 8 L8 9 L11 14 L9 15 L6 10 L3 13 Z"/>`);
	const ICON_RECT = svg(`<rect x="3.5" y="3.5" width="9" height="9" ${NF} ${ST}/>`);
	const ICON_ROUNDED = svg(`<rect x="3" y="4.5" width="10" height="7" rx="2.5" ${NF} ${ST}/>`);
	const ICON_CIRCLE = svg(`<circle cx="8" cy="8" r="5" ${NF} ${ST}/>`);
	const ICON_TRIANGLE = svg(`<polygon points="8,3 13.5,13 2.5,13" ${NF} ${ST}/>`);
	const ICON_DIAMOND = svg(`<polygon points="8,2.5 13.5,8 8,13.5 2.5,8" ${NF} ${ST}/>`);
	const ICON_PARALLELOGRAM = svg(`<polygon points="5,3 14,3 11,13 2,13" ${NF} ${ST}/>`);
	const ICON_HEXAGON = svg(`<polygon points="5.5,3 10.5,3 13.5,8 10.5,13 5.5,13 2.5,8" ${NF} ${ST}/>`);
	const ICON_STAR = svg(`<polygon points="8,2 9.7,6.4 14.5,6.4 10.7,9.3 12.1,13.8 8,11 3.9,13.8 5.3,9.3 1.5,6.4 6.3,6.4" ${NF} ${ST}/>`);
	const ICON_TERMINATOR = svg(`<rect x="2" y="5" width="12" height="6" rx="3" ${NF} ${ST}/>`);
	const ICON_MANUAL_INPUT = svg(`<polygon points="2,5.5 14,3 14,13 2,13" ${NF} ${ST}/>`);
	const ICON_PREDEFINED = svg(
		`<rect x="2" y="4" width="12" height="8" ${NF} ${ST}/>` +
		`<line x1="4.2" y1="4" x2="4.2" y2="12" ${NF} ${ST}/>` +
		`<line x1="11.8" y1="4" x2="11.8" y2="12" ${NF} ${ST}/>`,
	);
	const ICON_CYLINDER = svg(
		`<path d="M3 5 V11 C3 12.3 5.2 13 8 13 C10.8 13 13 12.3 13 11 V5" ${NF} ${ST}/>` +
		`<ellipse cx="8" cy="5" rx="5" ry="2" ${NF} ${ST}/>`,
	);
	const ICON_CLOUD = svg(
		`<path d="M4 11 C2.5 11 2.5 8.5 4 8.5 C4 6 7 6 7.5 8 C8 6.5 11 6.5 11 9 C12.5 9 12.5 11 11 11 Z" ${NF} ${ST}/>`,
	);
	const ICON_CARD = svg(
		`<polygon points="3,3 11,3 13,5 13,13 3,13" ${NF} ${ST}/>` +
		`<polyline points="11,3 11,5 13,5" ${NF} ${ST}/>`,
	);
	const ICON_CALLOUT = svg(
		`<path d="M3 3 H13 V11 H6 L4 14 V11 H3 Z" ${NF} ${ST}/>`,
	);
	const ICON_DOCUMENT = svg(
		`<path d="M3 3 H13 V11 C11 13 9 10 6.5 12 C5 13 4 11.5 3 11.5 Z" ${NF} ${ST}/>`,
	);
	const ICON_SERVER = svg(
		`<rect x="2.5" y="3" width="11" height="10" rx="1" ${NF} ${ST}/>` +
		`<line x1="2.5" y1="6.5" x2="13.5" y2="6.5" ${NF} ${ST}/>` +
		`<line x1="2.5" y1="10" x2="13.5" y2="10" ${NF} ${ST}/>` +
		`<circle cx="4.5" cy="4.8" r="0.6" fill="currentColor"/>` +
		`<circle cx="4.5" cy="8.3" r="0.6" fill="currentColor"/>`,
	);
	const ICON_ACTOR = svg(
		`<circle cx="8" cy="4" r="1.6" ${NF} ${ST}/>` +
		`<line x1="8" y1="5.6" x2="8" y2="10.5" ${NF} ${ST}/>` +
		`<line x1="4.5" y1="7.5" x2="11.5" y2="7.5" ${NF} ${ST}/>` +
		`<line x1="8" y1="10.5" x2="5.5" y2="14" ${NF} ${ST}/>` +
		`<line x1="8" y1="10.5" x2="10.5" y2="14" ${NF} ${ST}/>`,
	);
	const ICON_QUEUE = svg(
		`<path d="M5 4 L13 4 L13 12 L5 12 A2 4 0 0 1 5 4 Z" ${NF} ${ST}/>` +
		`<ellipse cx="5" cy="8" rx="2" ry="4" ${NF} ${ST}/>`,
	);

	// Line icons
	const ICON_LINE = svg(`<path d="M2 13 L14 3" ${NF} ${ST}/>`);
	const ICON_ARROW = svg(`<path d="M2 13 L13 3 M13 3 L8 3 M13 3 L13 8" ${NF} ${ST}/>`);
	const ICON_BIARROW = svg(
		`<path d="M2 8 L14 8" ${NF} ${ST}/>` +
		`<path d="M5 5 L2 8 L5 11" ${NF} ${ST}/>` +
		`<path d="M11 5 L14 8 L11 11" ${NF} ${ST}/>`,
	);
	const ICON_LINE_DASHED = svg(`<path d="M2 13 L14 3" ${NF} ${ST} stroke-dasharray="3 2"/>`);
	const ICON_LINE_DOTTED = svg(`<path d="M2 13 L14 3" ${NF} ${ST} stroke-dasharray="1 2.2"/>`);
	const ICON_ARROW_DASHED = svg(
		`<path d="M2 13 L12 3" ${NF} ${ST} stroke-dasharray="3 2"/>` +
		`<path d="M12 3 L8 3 M12 3 L12 7" ${NF} ${ST}/>`,
	);
	// UML markers shown at the end of a short stroke
	const ICON_INHERITANCE = svg(
		`<path d="M2 11 L9 4" ${NF} ${ST}/>` +
		`<polygon points="9,4 13,4 13,8" fill="#ffffff" ${ST}/>`,
	);
	const ICON_REALIZATION = svg(
		`<path d="M2 11 L9 4" ${NF} ${ST} stroke-dasharray="2 2"/>` +
		`<polygon points="9,4 13,4 13,8" fill="#ffffff" ${ST}/>`,
	);
	const ICON_AGGREGATION = svg(
		`<path d="M2 11 L8 8" ${NF} ${ST}/>` +
		`<polygon points="8,8 11,6 14,8 11,10" fill="#ffffff" ${ST}/>`,
	);
	const ICON_COMPOSITION = svg(
		`<path d="M2 11 L8 8" ${NF} ${ST}/>` +
		`<polygon points="8,8 11,6 14,8 11,10" fill="currentColor" ${ST}/>`,
	);
	const ICON_PEN = svg(
		`<path d="M2 11.5 C3.2 7.2, 5.1 6.8, 6.4 9.2 S9.1 12.1, 10.1 8.6 S12.2 3.9, 14 5.2" ${NF} ${ST}/>`,
	);
	const ICON_TEXT = svg(`<path d="M3 3 H13 M8 3 V13" ${NF} stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);

	// ---- tool definitions ------------------------------------------------

	/**
	 * Tool catalog. `subgroup` is used inside dropdown popovers to group
	 * tools under sub-headings (e.g. "Basic" / "Flowchart" / "Infra").
	 */
	const TOOLS = [
		// Select
		{ id: 'select', group: 'select', kind: 'select',
		  labelKey: 'toolSelect', fallback: 'Select', icon: ICON_SELECT },

		// Shapes - Basic
		{ id: 'square', group: 'shapes', subgroup: 'basic', kind: 'legacy',
		  labelKey: 'toolSquare', fallback: 'Rectangle', icon: ICON_RECT },
		{ id: 'roundedRectangle', group: 'shapes', subgroup: 'basic', kind: 'shape', shapeType: 'roundedRectangle',
		  labelKey: 'toolRoundedRectangle', fallback: 'Rounded rectangle', icon: ICON_ROUNDED },
		{ id: 'circle', group: 'shapes', subgroup: 'basic', kind: 'legacy',
		  labelKey: 'toolCircle', fallback: 'Ellipse', icon: ICON_CIRCLE },
		{ id: 'triangle', group: 'shapes', subgroup: 'basic', kind: 'shape', shapeType: 'triangle',
		  labelKey: 'toolTriangle', fallback: 'Triangle', icon: ICON_TRIANGLE },
		{ id: 'diamond', group: 'shapes', subgroup: 'basic', kind: 'shape', shapeType: 'diamond',
		  labelKey: 'toolDiamond', fallback: 'Diamond', icon: ICON_DIAMOND },
		{ id: 'parallelogram', group: 'shapes', subgroup: 'basic', kind: 'shape', shapeType: 'parallelogram',
		  labelKey: 'toolParallelogram', fallback: 'Parallelogram', icon: ICON_PARALLELOGRAM },
		{ id: 'hexagon', group: 'shapes', subgroup: 'basic', kind: 'shape', shapeType: 'hexagon',
		  labelKey: 'toolHexagon', fallback: 'Hexagon', icon: ICON_HEXAGON },
		{ id: 'star', group: 'shapes', subgroup: 'basic', kind: 'shape', shapeType: 'star',
		  labelKey: 'toolStar', fallback: 'Star', icon: ICON_STAR },

		// Shapes - Flowchart
		{ id: 'terminator', group: 'shapes', subgroup: 'flowchart', kind: 'shape', shapeType: 'terminator',
		  labelKey: 'toolTerminator', fallback: 'Terminator (start/end)', icon: ICON_TERMINATOR },
		{ id: 'document', group: 'shapes', subgroup: 'flowchart', kind: 'shape', shapeType: 'document',
		  labelKey: 'toolDocument', fallback: 'Document', icon: ICON_DOCUMENT },
		{ id: 'manualInput', group: 'shapes', subgroup: 'flowchart', kind: 'shape', shapeType: 'manualInput',
		  labelKey: 'toolManualInput', fallback: 'Manual input', icon: ICON_MANUAL_INPUT },
		{ id: 'predefinedProcess', group: 'shapes', subgroup: 'flowchart', kind: 'shape', shapeType: 'predefinedProcess',
		  labelKey: 'toolPredefinedProcess', fallback: 'Predefined process', icon: ICON_PREDEFINED },

		// Shapes - Infrastructure / IT
		{ id: 'cylinder', group: 'shapes', subgroup: 'infra', kind: 'shape', shapeType: 'cylinder',
		  labelKey: 'toolCylinder', fallback: 'Cylinder / Database', icon: ICON_CYLINDER },
		{ id: 'queue', group: 'shapes', subgroup: 'infra', kind: 'shape', shapeType: 'queue',
		  labelKey: 'toolQueue', fallback: 'Queue', icon: ICON_QUEUE },
		{ id: 'server', group: 'shapes', subgroup: 'infra', kind: 'shape', shapeType: 'server',
		  labelKey: 'toolServer', fallback: 'Server / node', icon: ICON_SERVER },
		{ id: 'cloud', group: 'shapes', subgroup: 'infra', kind: 'shape', shapeType: 'cloud',
		  labelKey: 'toolCloud', fallback: 'Cloud', icon: ICON_CLOUD },
		{ id: 'actor', group: 'shapes', subgroup: 'infra', kind: 'shape', shapeType: 'actor',
		  labelKey: 'toolActor', fallback: 'Actor', icon: ICON_ACTOR },
		{ id: 'card-shape', group: 'shapes', subgroup: 'infra', kind: 'shape', shapeType: 'card',
		  labelKey: 'toolCardShape', fallback: 'Card', icon: ICON_CARD },
		{ id: 'callout', group: 'shapes', subgroup: 'infra', kind: 'shape', shapeType: 'callout',
		  labelKey: 'toolCallout', fallback: 'Callout', icon: ICON_CALLOUT },

		// Lines - Basic
		{ id: 'line', group: 'lines', subgroup: 'basic', kind: 'line',
		  lineSpec: { type: 'line', strokeStyle: 'solid', startArrow: 'none', endArrow: 'none' },
		  labelKey: 'toolLine', fallback: 'Solid line', icon: ICON_LINE },
		{ id: 'arrow', group: 'lines', subgroup: 'basic', kind: 'line',
		  lineSpec: { type: 'arrow', strokeStyle: 'solid', startArrow: 'none', endArrow: 'arrow' },
		  labelKey: 'toolArrow', fallback: 'Arrow', icon: ICON_ARROW },
		{ id: 'biarrow', group: 'lines', subgroup: 'basic', kind: 'line',
		  lineSpec: { type: 'arrow', strokeStyle: 'solid', startArrow: 'arrow', endArrow: 'arrow' },
		  labelKey: 'toolBiArrow', fallback: 'Bidirectional arrow', icon: ICON_BIARROW },
		{ id: 'line-dashed', group: 'lines', subgroup: 'basic', kind: 'line',
		  lineSpec: { type: 'line', strokeStyle: 'dashed', startArrow: 'none', endArrow: 'none' },
		  labelKey: 'toolLineDashed', fallback: 'Dashed line', icon: ICON_LINE_DASHED },
		{ id: 'line-dotted', group: 'lines', subgroup: 'basic', kind: 'line',
		  lineSpec: { type: 'line', strokeStyle: 'dotted', startArrow: 'none', endArrow: 'none' },
		  labelKey: 'toolLineDotted', fallback: 'Dotted line', icon: ICON_LINE_DOTTED },
		{ id: 'arrow-dashed', group: 'lines', subgroup: 'basic', kind: 'line',
		  lineSpec: { type: 'arrow', strokeStyle: 'dashed', startArrow: 'none', endArrow: 'arrow' },
		  labelKey: 'toolArrowDashed', fallback: 'Dashed arrow', icon: ICON_ARROW_DASHED },

		// Lines - UML connectors
		{ id: 'arrow-inheritance', group: 'lines', subgroup: 'uml', kind: 'line',
		  lineSpec: { type: 'line', strokeStyle: 'solid', startArrow: 'none', endArrow: 'triangle' },
		  labelKey: 'toolInheritance', fallback: 'Inheritance', icon: ICON_INHERITANCE },
		{ id: 'arrow-realization', group: 'lines', subgroup: 'uml', kind: 'line',
		  lineSpec: { type: 'line', strokeStyle: 'dashed', startArrow: 'none', endArrow: 'triangle' },
		  labelKey: 'toolRealization', fallback: 'Realization', icon: ICON_REALIZATION },
		{ id: 'arrow-aggregation', group: 'lines', subgroup: 'uml', kind: 'line',
		  lineSpec: { type: 'line', strokeStyle: 'solid', startArrow: 'none', endArrow: 'diamond-open' },
		  labelKey: 'toolAggregation', fallback: 'Aggregation', icon: ICON_AGGREGATION },
		{ id: 'arrow-composition', group: 'lines', subgroup: 'uml', kind: 'line',
		  lineSpec: { type: 'line', strokeStyle: 'solid', startArrow: 'none', endArrow: 'diamond-filled' },
		  labelKey: 'toolComposition', fallback: 'Composition', icon: ICON_COMPOSITION },
		{ id: 'arrow-dependency', group: 'lines', subgroup: 'uml', kind: 'line',
		  lineSpec: { type: 'arrow', strokeStyle: 'dashed', startArrow: 'none', endArrow: 'arrow' },
		  labelKey: 'toolDependency', fallback: 'Dependency', icon: ICON_ARROW_DASHED },

		// Freehand
		{ id: 'pen', group: 'pen', kind: 'pen',
		  labelKey: 'toolPen', fallback: 'Pen', icon: ICON_PEN },

		// Text
		{ id: 'text', group: 'text', kind: 'text',
		  labelKey: 'toolText', fallback: 'Text', icon: ICON_TEXT },
	];

	const DEFAULT_TOOL = 'select';
	const TOOL_BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

	function getToolDef(id) { return TOOL_BY_ID.get(id) || null; }

	// ---- top-level slot layout ------------------------------------------

	const SLOT_ORDER = ['select', 'shapes', 'lines', 'pen', 'text'];

	/**
	 * Default tool shown on each dropdown slot when nothing in that group
	 * has been picked yet. Picked as the most universally-useful starting
	 * point per group.
	 */
	const DROPDOWN_DEFAULT_TOOL = {
		shapes: 'square',
		lines: 'arrow',
	};

	const DROPDOWN_LABEL_KEY = {
		shapes: { key: 'toolGroupShapes', fallback: 'Shapes' },
		lines: { key: 'toolGroupLines', fallback: 'Lines' },
	};

	const SUBGROUP_LABEL = {
		basic: { key: 'toolSubgroupBasic', fallback: 'Basic' },
		flowchart: { key: 'toolSubgroupFlowchart', fallback: 'Flowchart' },
		infra: { key: 'toolSubgroupInfra', fallback: 'Infrastructure / IT' },
		uml: { key: 'toolSubgroupUml', fallback: 'UML connectors' },
	};

	/** Subgroup order inside each dropdown popover. */
	const SUBGROUP_ORDER_SHAPES = ['basic', 'flowchart', 'infra'];
	const SUBGROUP_ORDER_LINES = ['basic', 'uml'];

	// ---- DOM helpers -----------------------------------------------------

	function makeIconButton(tool, onClick, extraClass) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'tool-btn icon-btn' + (extraClass ? ' ' + extraClass : '');
		btn.dataset.tool = tool.id;
		const label = t(tool.labelKey, tool.fallback);
		btn.title = label;
		btn.setAttribute('aria-label', label);
		btn.innerHTML = tool.icon;
		btn.addEventListener('click', (evt) => onClick(evt, tool));
		return btn;
	}

	function makeSeparator() {
		const sep = document.createElement('span');
		sep.className = 'toolbar-tools-separator';
		sep.setAttribute('aria-hidden', 'true');
		return sep;
	}

	const CARET_SVG =
		`<svg viewBox="0 0 8 8" aria-hidden="true" class="dropdown-caret-icon">` +
		`<path d="M1 3 L4 6 L7 3" fill="none" stroke="currentColor" stroke-width="1.4" ` +
		`stroke-linecap="round" stroke-linejoin="round"/></svg>`;

	// ---- popover content -------------------------------------------------

	function buildDropdownContent(groupId, activeToolId, onPick) {
		const root = document.createElement('div');
		root.className = 'toolbar-popover-content';
		root.dataset.group = groupId;

		const groupTools = TOOLS.filter((tool) => tool.group === groupId);
		const subgroupOrder = groupId === 'shapes' ? SUBGROUP_ORDER_SHAPES : SUBGROUP_ORDER_LINES;

		for (const subgroup of subgroupOrder) {
			const tools = groupTools.filter((tool) => tool.subgroup === subgroup);
			if (tools.length === 0) continue;

			const heading = document.createElement('div');
			heading.className = 'toolbar-popover-heading';
			const headingMeta = SUBGROUP_LABEL[subgroup] || { fallback: subgroup };
			heading.textContent = t(headingMeta.key, headingMeta.fallback);
			root.appendChild(heading);

			const grid = document.createElement('div');
			grid.className = 'toolbar-popover-grid';
			for (const tool of tools) {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'toolbar-popover-item';
				if (tool.id === activeToolId) btn.classList.add('active');
				const label = t(tool.labelKey, tool.fallback);
				btn.title = label;
				btn.setAttribute('aria-label', label);
				btn.innerHTML = `<span class="toolbar-popover-icon">${tool.icon}</span>` +
					`<span class="toolbar-popover-label">${label}</span>`;
				btn.addEventListener('click', () => onPick(tool.id));
				grid.appendChild(btn);
			}
			root.appendChild(grid);
		}

		return root;
	}

	// ---- mount -----------------------------------------------------------

	function mount(host, onToolChange) {
		const Dropdown = window.CanvasNotes && window.CanvasNotes.EditorDropdown;
		host.innerHTML = '';
		let active = DEFAULT_TOOL;

		// Per-dropdown state: { rootBtn, iconHost, currentToolId }
		const dropdowns = new Map();
		// Standalone (non-dropdown) buttons by id, for highlighting.
		const flatButtons = new Map();

		const slotElements = [];

		function setActive(id) {
			active = id;
			// Highlight flat buttons.
			for (const [tid, btn] of flatButtons.entries()) {
				btn.classList.toggle('active', tid === id);
			}
			// Highlight dropdown buttons and update their displayed icon.
			for (const [groupId, dd] of dropdowns.entries()) {
				const def = getToolDef(id);
				const isInThisGroup = def && def.group === groupId;
				if (isInThisGroup) {
					dd.currentToolId = id;
					updateDropdownIcon(dd, id);
				}
				dd.rootBtn.classList.toggle('active', isInThisGroup);
			}
			if (typeof onToolChange === 'function') onToolChange(id);
		}

		function updateDropdownIcon(dd, toolId) {
			const def = getToolDef(toolId);
			if (!def) return;
			const label = t(def.labelKey, def.fallback);
			dd.iconHost.innerHTML = def.icon;
			dd.rootBtn.title = label;
			dd.rootBtn.setAttribute('aria-label', label);
			dd.rootBtn.dataset.tool = toolId;
		}

		function openDropdown(groupId) {
			const dd = dropdowns.get(groupId);
			if (!dd) return;
			if (Dropdown && Dropdown.isOpen()) {
				Dropdown.close();
				// If the popover for the same anchor was open, treat the
				// click as a toggle-close.
				return;
			}
			if (!Dropdown) return;
			Dropdown.open(dd.rootBtn, (close) => {
				return buildDropdownContent(groupId, active, (toolId) => {
					close();
					setActive(toolId);
				});
			});
		}

		function buildSelectSlot() {
			const tool = TOOLS.find((t) => t.group === 'select');
			const btn = makeIconButton(tool, () => setActive(tool.id));
			flatButtons.set(tool.id, btn);
			return btn;
		}

		function buildSimpleSlot(groupId) {
			const tool = TOOLS.find((t) => t.group === groupId);
			const btn = makeIconButton(tool, () => setActive(tool.id));
			flatButtons.set(tool.id, btn);
			return btn;
		}

		function buildDropdownSlot(groupId) {
			const meta = DROPDOWN_LABEL_KEY[groupId];
			const initialToolId = DROPDOWN_DEFAULT_TOOL[groupId];
			const initialDef = getToolDef(initialToolId);
			const label = t(meta.key, meta.fallback);

			const wrap = document.createElement('div');
			wrap.className = 'toolbar-dropdown';
			wrap.dataset.group = groupId;

			const rootBtn = document.createElement('button');
			rootBtn.type = 'button';
			rootBtn.className = 'tool-btn icon-btn toolbar-dropdown-btn';
			rootBtn.dataset.tool = initialToolId;
			rootBtn.title = label;
			rootBtn.setAttribute('aria-label', label);
			rootBtn.setAttribute('aria-haspopup', 'menu');

			const iconHost = document.createElement('span');
			iconHost.className = 'toolbar-dropdown-icon';
			iconHost.innerHTML = initialDef ? initialDef.icon : '';
			rootBtn.appendChild(iconHost);

			const caret = document.createElement('span');
			caret.className = 'toolbar-dropdown-caret';
			caret.innerHTML = CARET_SVG;
			rootBtn.appendChild(caret);

			const dd = { rootBtn, iconHost, currentToolId: initialToolId, groupId };
			dropdowns.set(groupId, dd);

			// Click semantics (Figma-style):
			//   - if the dropdown's current tool is NOT active, the click
			//     selects that tool (fast re-pick of the last used variant);
			//   - if it IS active, the click opens the popover.
			rootBtn.addEventListener('click', () => {
				const def = getToolDef(active);
				if (def && def.group === groupId) {
					openDropdown(groupId);
				} else {
					setActive(dd.currentToolId);
				}
			});

			// Caret area always opens the popover regardless of state.
			caret.addEventListener('click', (evt) => {
				evt.stopPropagation();
				openDropdown(groupId);
			});

			wrap.appendChild(rootBtn);
			return wrap;
		}

		for (const slot of SLOT_ORDER) {
			if (slot !== 'select' && slotElements.length > 0) {
				// Separator between select and the rest, and between
				// dropdowns and the trailing pen/text simple buttons.
				if (slot === 'shapes' || slot === 'pen') {
					host.appendChild(makeSeparator());
				}
			}
			let node;
			switch (slot) {
				case 'select': node = buildSelectSlot(); break;
				case 'shapes':
				case 'lines':  node = buildDropdownSlot(slot); break;
				case 'pen':
				case 'text':   node = buildSimpleSlot(slot); break;
			}
			if (node) {
				host.appendChild(node);
				slotElements.push(node);
			}
		}

		setActive(active);

		return {
			getActive: () => active,
			setActive,
		};
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.Toolbar = { TOOLS, DEFAULT_TOOL, mount, getToolDef };
})();
