/* eslint-disable no-undef */
/**
 * Toolbar UI for the Canvas Editor webview.
 *
 * Top-level layout (Figma-style compact toolbar):
 *
 *   [Select] | [Shapes ▼] [Lines ▼] | [Pen] [Text]
 *
 * Shapes and Lines are split-button dropdowns: the button shows the last
 * tool picked from that group, the caret opens a popover with the full
 * palette grouped into sub-sections.
 *
 * Tool model:
 *   - id           - canonical tool id used by the editor controller;
 *   - kind         - 'select' | 'shape' | 'line' | 'pen' | 'text';
 *   - shapeType    - ShapeType for kind === 'shape';
 *   - lineSpec     - { type, strokeStyle, startArrow, endArrow } for 'line';
 *   - aliasOf      - if set, this tile reuses the same shapeType as another
 *                    tool but appears in the popover under a different name
 *                    (e.g. Process is an alias of Rectangle inside Flowchart).
 *
 * Icons are derived automatically for shape tools by rendering the
 * shape's geometry into a 16x16 viewBox at construction time. This keeps
 * the icon visually identical to the placed shape and removes the need
 * to maintain a duplicate hand-drawn icon per shape.
 *
 * Exposed as global CanvasNotes.Toolbar.
 */

(function () {
	'use strict';

	const ShapeGeometry = window.CanvasNotes && window.CanvasNotes.ShapeGeometry;

	function t(key, fallback) {
		const i18n = window.CanvasNotes && window.CanvasNotes.t;
		return typeof i18n === 'function' ? i18n(key) : fallback;
	}

	// ---- icon builders ---------------------------------------------------

	const ICON_VIEWBOX = 16;
	const ICON_INSET = 1.5;     // padding around the shape inside the viewBox
	const ICON_STROKE = 1.4;

	const NF = 'fill="none"';
	const ST = 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
	const UML_JOIN = 'stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter"';

	function svgWrap(inner) {
		return `<svg viewBox="0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}" aria-hidden="true">${inner}</svg>`;
	}

	/**
	 * Builds an icon SVG by rendering a ShapeType into a small viewBox.
	 * Box dimensions favor a slightly wider-than-tall rectangle so most
	 * shapes (cards, queues, terminators) read at glance; symmetric shapes
	 * (circle, diamond, star, BPMN gates) get a square box.
	 */
	function shapeIcon(shapeType, squareBox) {
		if (!ShapeGeometry || !ShapeGeometry.shapeDraw) return svgWrap('');
		const inset = ICON_INSET;
		const w = ICON_VIEWBOX - inset * 2;
		const h = squareBox ? w : w * 0.7;
		const y = squareBox ? inset : inset + (w - h) / 2;
		const box = { x: inset, y: y, w: w, h: h };
		const draw = ShapeGeometry.shapeDraw(shapeType, box);
		if (!draw) return svgWrap('');
		// The icon is drawn with stroke=currentColor and no fill so the
		// silhouette is readable regardless of the toolbar background.
		const styleAttr = `fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linejoin="round" stroke-linecap="round"`;
		if (draw.kind === 'polygon') return svgWrap(`<polygon points="${draw.points}" ${styleAttr}/>`);
		if (draw.kind === 'path') return svgWrap(`<path d="${draw.d}" ${styleAttr}/>`);
		if (draw.kind === 'rect') {
			const rxAttr = draw.rx > 0 ? ` rx="${draw.rx}"` : '';
			return svgWrap(`<rect x="${draw.x}" y="${draw.y}" width="${draw.w}" height="${draw.h}"${rxAttr} ${styleAttr}/>`);
		}
		if (draw.kind === 'cylinder') {
			return svgWrap(
				`<path d="${draw.body}" ${styleAttr}/>` +
				`<ellipse cx="${draw.top.cx}" cy="${draw.top.cy}" rx="${draw.top.rx}" ry="${draw.top.ry}" ${styleAttr}/>`,
			);
		}
		if (draw.kind === 'compound') {
			const parts = [];
			for (const p of draw.pieces) {
				const noFill = (p.fillOverride === 'none' || p.noStroke) ? styleAttr : styleAttr;
				switch (p.type) {
					case 'rect': {
						const rx = p.rx !== undefined ? ` rx="${p.rx}"` : '';
						parts.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"${rx} ${noFill}/>`);
						break;
					}
					case 'ellipse':
						parts.push(`<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" ${noFill}/>`);
						break;
					case 'circle':
						parts.push(`<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" ${noFill}/>`);
						break;
					case 'polygon':
						parts.push(`<polygon points="${p.points}" ${noFill}/>`);
						break;
					case 'path':
						parts.push(`<path d="${p.d}" ${noFill}/>`);
						break;
					case 'line':
						parts.push(`<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" ${noFill}/>`);
						break;
				}
			}
			return svgWrap(parts.join(''));
		}
		return svgWrap('');
	}

	// Specialized icons for non-shape tools.
	const ICON_SELECT = svgWrap(`<path d="M3 2 L13 8 L8 9 L11 14 L9 15 L6 10 L3 13 Z"/>`);
	const ICON_PEN = svgWrap(
		`<path d="M2 11.5 C3.2 7.2, 5.1 6.8, 6.4 9.2 S9.1 12.1, 10.1 8.6 S12.2 3.9, 14 5.2" ${NF} ${ST}/>`,
	);
	const ICON_TEXT = svgWrap(
		`<path d="M3 3 H13 M8 3 V13" ${NF} stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
	);

	// Line icons - drawn horizontally so the line palette reads uniformly.
	const ICON_LINE = svgWrap(`<path d="M2 8 L14 8" ${NF} ${ST}/>`);
	const ICON_ARROW = svgWrap(`<path d="M2 8 L13 8 M13 8 L9 5 M13 8 L9 11" ${NF} ${ST}/>`);
	const ICON_BIARROW = svgWrap(
		`<path d="M2 8 L14 8" ${NF} ${ST}/>` +
		`<path d="M5 5 L2 8 L5 11" ${NF} ${ST}/>` +
		`<path d="M11 5 L14 8 L11 11" ${NF} ${ST}/>`,
	);
	const ICON_LINE_DASHED = svgWrap(`<path d="M2 8 L14 8" ${NF} ${ST} stroke-dasharray="3 2"/>`);
	const ICON_LINE_DOTTED = svgWrap(`<path d="M2 8 L14 8" ${NF} ${ST} stroke-dasharray="1 2.2"/>`);
	const ICON_LINE_THICK = svgWrap(`<path d="M2 8 L14 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`);
	const ICON_ARROW_DASHED = svgWrap(
		`<path d="M2 8 L11 8" ${NF} ${ST} stroke-dasharray="2 2"/>` +
		`<path d="M11 5 L14 8 L11 11" ${NF} ${ST}/>`,
	);
	const ICON_INHERITANCE = svgWrap(
		`<path d="M2 8 L9 8" ${NF} ${ST}/>` +
		`<polygon points="9,4 14,8 9,12" fill="#ffffff" ${UML_JOIN}/>`,
	);
	const ICON_REALIZATION = svgWrap(
		`<path d="M2 8 L9 8" ${NF} ${ST} stroke-dasharray="2 2"/>` +
		`<polygon points="9,4 14,8 9,12" fill="#ffffff" ${UML_JOIN}/>`,
	);
	const ICON_AGGREGATION = svgWrap(
		`<path d="M2 8 L7 8" ${NF} ${ST}/>` +
		`<polygon points="7,8 10.5,5 14,8 10.5,11" fill="#ffffff" ${UML_JOIN}/>`,
	);
	const ICON_COMPOSITION = svgWrap(
		`<path d="M2 8 L7 8" ${NF} ${ST}/>` +
		`<polygon points="7,8 10.5,5 14,8 10.5,11" fill="currentColor" ${UML_JOIN}/>`,
	);

	// ---- hand-crafted icon overrides ---------------------------------

	// For a few compound shapes (multipleDocuments, predefinedProcess,
	// server, firewall) the auto-generated icon from the real geometry
	// produces visually noisy icons at 16x16 - several short parallel
	// strokes blend together. These overrides are minimalist hand-tuned
	// glyphs that keep the canvas geometry intact and only replace the
	// preview shown in the toolbar / popover.
	const ICON_OVERRIDES = {
		multipleDocuments: svgWrap(
			// Single rear sheet outline + front document with wave.
			`<rect x="5" y="2.5" width="8" height="10" ${NF} ${ST}/>` +
			`<path d="M3 4.5 H11 V11.5 C9.5 13 7.5 11 5.5 12.2 C4.5 12.8 3.8 11.8 3 11.8 Z" ${NF} ${ST}/>`,
		),
		predefinedProcess: svgWrap(
			// Rect + two vertical bars, drawn as one path so adjacent strokes
			// share line caps cleanly.
			`<path d="M2 4 H14 V12 H2 Z M4.5 4 V12 M11.5 4 V12" ${NF} ${ST}/>`,
		),
		server: svgWrap(
			// 1U rack: short wide rect with one divider.
			`<rect x="2" y="4" width="12" height="8" rx="1" ${NF} ${ST}/>` +
			`<line x1="2" y1="8" x2="14" y2="8" ${NF} ${ST}/>`,
		),
		firewall: svgWrap(
			// Brick wall with one top vertical + two bottom verticals.
			`<path d="M2 4 H14 V12 H2 Z M2 8 H14 M8 4 V8 M5 8 V12 M11 8 V12" ${NF} ${ST}/>`,
		),
		loadBalancer: svgWrap(
			// Circle in center, single inbound arrow on the left, two
			// outbound on the right. Simpler than auto-generated version.
			`<circle cx="8" cy="8" r="3" ${NF} ${ST}/>` +
			`<path d="M2 8 L5 8" ${NF} ${ST}/>` +
			`<path d="M11 8 L13 5" ${NF} ${ST}/>` +
			`<path d="M11 8 L13 11" ${NF} ${ST}/>`,
		),
	};

	// ---- tool catalog ----------------------------------------------------

	function shape(id, shapeType, subgroup, labelKey, fallback, opts) {
		const o = opts || {};
		const icon = ICON_OVERRIDES[shapeType] || shapeIcon(shapeType, !!o.squareIcon);
		return {
			id,
			group: 'shapes',
			subgroup,
			kind: 'shape',
			shapeType,
			labelKey,
			fallback,
			icon,
		};
	}

	function lineTool(id, subgroup, labelKey, fallback, icon, lineSpec) {
		return { id, group: 'lines', subgroup, kind: 'line', lineSpec, labelKey, fallback, icon };
	}

	/**
	 * Full tool catalog. Each entry maps to one tile in the dropdown
	 * popover; the `setActive` flow uses `id` while `shapeType` / `lineSpec`
	 * carry the visual properties for actual drawing.
	 *
	 * Aliases (Process / Decision / Data / Task / Button etc.) reuse an
	 * existing `shapeType` but appear in a different sub-section with a
	 * different label, so the popover navigation matches the user's mental
	 * model without duplicating geometry.
	 */
	const TOOLS = [
		// Select.
		{ id: 'select', group: 'select', kind: 'select',
		  labelKey: 'toolSelect', fallback: 'Select', icon: ICON_SELECT },

		// Basic / General.
		shape('rectangle',              'rectangle',            'basic', 'toolRectangle',              'Rectangle'),
		shape('roundedRectangle',       'roundedRectangle',     'basic', 'toolRoundedRectangle',       'Rounded rectangle'),
		shape('ellipse',                'ellipse',              'basic', 'toolEllipse',                'Ellipse', { squareIcon: true }),
		shape('triangle',               'triangle',             'basic', 'toolTriangle',               'Triangle', { squareIcon: true }),
		shape('diamond',                'diamond',              'basic', 'toolDiamond',                'Rhombus / Diamond', { squareIcon: true }),
		shape('hexagon',                'hexagon',              'basic', 'toolHexagon',                'Hexagon'),
		shape('parallelogram',          'parallelogram',        'basic', 'toolParallelogram',          'Parallelogram'),
		shape('trapezoid',              'trapezoid',            'basic', 'toolTrapezoid',              'Trapezoid'),
		shape('cloud',                  'cloud',                'basic', 'toolCloud',                  'Cloud'),
		shape('cylinder',               'cylinder',             'basic', 'toolCylinder',               'Cylinder / Database'),
		shape('star',                   'star',                 'basic', 'toolStar',                   'Star', { squareIcon: true }),
		shape('heart',                  'heart',                'basic', 'toolHeart',                  'Heart', { squareIcon: true }),
		shape('speechBubble',           'callout',              'basic', 'toolSpeechBubble',           'Speech bubble / Callout'),
		shape('noteStickyNote',         'stickyNote',           'basic', 'toolStickyNote',             'Note / Sticky note'),
		shape('folder',                 'folder',               'basic', 'toolFolder',                 'Folder'),
		shape('messageEnvelope',        'envelope',             'basic', 'toolMessageEnvelope',        'Message / Envelope'),

		// Flowchart.
		shape('predefinedProcess',      'predefinedProcess',    'flowchart', 'toolPredefinedProcess',      'Predefined process'),
		shape('document',               'document',             'flowchart', 'toolDocument',               'Document'),
		shape('multipleDocuments',      'multipleDocuments',    'flowchart', 'toolMultipleDocuments',      'Multiple documents'),
		shape('terminator',             'terminator',           'flowchart', 'toolTerminator',             'Terminator / Start-End'),
		shape('manualInput',            'manualInput',          'flowchart', 'toolManualInput',            'Manual input'),
		shape('offPageConnector',       'offPageConnector',     'flowchart', 'toolOffPageConnector',       'Off-page connector'),
		shape('delay',                  'delay',                'flowchart', 'toolDelay',                  'Delay'),

		// Containers.
		shape('container',              'container',            'containers', 'toolContainer',             'Container'),
		shape('swimlane',               'swimlane',             'containers', 'toolSwimlane',              'Swimlane'),
		shape('table',                  'table',                'containers', 'toolTable',                 'Table'),

		// Data / Documents.
		shape('storedData',             'storedData',           'dataDocuments', 'toolStoredData',            'Stored data'),
		shape('tape',                   'punchedTape',          'dataDocuments', 'toolTape',                  'Tape'),

		// Architecture / Infrastructure.
		shape('server',                 'server',               'architecture', 'toolServer',                 'Server / node'),
		shape('queue',                  'queue',                'architecture', 'toolQueue',                  'Queue'),
		shape('actor',                  'actor',                'architecture', 'toolActor',                  'Actor', { squareIcon: true }),
		shape('gear',                   'gear',                 'architecture', 'toolGear',                   'Gear / Service', { squareIcon: true }),
		shape('loadBalancer',           'loadBalancer',         'architecture', 'toolLoadBalancer',           'Load balancer', { squareIcon: true }),
		shape('firewall',               'firewall',             'architecture', 'toolFirewall',               'Firewall'),
		shape('lock',                   'lock',                 'architecture', 'toolLock',                   'Lock', { squareIcon: true }),

		// Devices.
		shape('browser',                'browser',              'devices', 'toolBrowser',                'Browser'),
		shape('desktop',                'desktop',              'devices', 'toolDesktop',                'Desktop', { squareIcon: true }),
		shape('laptop',                 'laptop',               'devices', 'toolLaptop',                 'Laptop'),
		shape('mobile',                 'mobile',               'devices', 'toolMobile',                 'Mobile', { squareIcon: true }),

		// Notes / annotations.
		shape('cardShape',              'card',                 'notes', 'toolCardShape',              'Card'),

		// Lines - basic.
		lineTool('line',         'basic', 'toolLine',         'Solid line',         ICON_LINE,
			{ type: 'line',  strokeStyle: 'solid',  startArrow: 'none',  endArrow: 'none'  }),
		lineTool('arrow',        'basic', 'toolArrow',        'Arrow',              ICON_ARROW,
			{ type: 'arrow', strokeStyle: 'solid',  startArrow: 'none',  endArrow: 'arrow' }),
		lineTool('biarrow',      'basic', 'toolBiArrow',      'Bidirectional arrow',ICON_BIARROW,
			{ type: 'arrow', strokeStyle: 'solid',  startArrow: 'arrow', endArrow: 'arrow' }),
		lineTool('line-dashed',  'basic', 'toolLineDashed',   'Dashed line',        ICON_LINE_DASHED,
			{ type: 'line',  strokeStyle: 'dashed', startArrow: 'none',  endArrow: 'none'  }),
		lineTool('line-dotted',  'basic', 'toolLineDotted',   'Dotted line',        ICON_LINE_DOTTED,
			{ type: 'line',  strokeStyle: 'dotted', startArrow: 'none',  endArrow: 'none'  }),
		lineTool('line-thick',   'basic', 'toolLineThick',    'Thick line',         ICON_LINE_THICK,
			{ type: 'line',  strokeStyle: 'solid',  startArrow: 'none',  endArrow: 'none', strokeWidth: 4 }),
		lineTool('arrow-dashed', 'basic', 'toolArrowDashed',  'Dashed arrow',       ICON_ARROW_DASHED,
			{ type: 'arrow', strokeStyle: 'dashed', startArrow: 'none',  endArrow: 'arrow' }),

		// Lines - UML.
		lineTool('arrow-inheritance', 'uml', 'toolInheritance', 'Inheritance', ICON_INHERITANCE,
			{ type: 'line',  strokeStyle: 'solid',  startArrow: 'none',  endArrow: 'triangle' }),
		lineTool('arrow-realization', 'uml', 'toolRealization', 'Realization', ICON_REALIZATION,
			{ type: 'line',  strokeStyle: 'dashed', startArrow: 'none',  endArrow: 'triangle' }),
		lineTool('arrow-aggregation', 'uml', 'toolAggregation', 'Aggregation', ICON_AGGREGATION,
			{ type: 'line',  strokeStyle: 'solid',  startArrow: 'none',  endArrow: 'diamond-open' }),
		lineTool('arrow-composition', 'uml', 'toolComposition', 'Composition', ICON_COMPOSITION,
			{ type: 'line',  strokeStyle: 'solid',  startArrow: 'none',  endArrow: 'diamond-filled' }),
		lineTool('arrow-dependency',  'uml', 'toolDependency',  'Dependency',  ICON_ARROW_DASHED,
			{ type: 'arrow', strokeStyle: 'dashed', startArrow: 'none',  endArrow: 'arrow' }),

		// Freehand + text.
		{ id: 'pen',  group: 'pen',  kind: 'pen',
		  labelKey: 'toolPen',  fallback: 'Pen',  icon: ICON_PEN },
		{ id: 'text', group: 'text', kind: 'text',
		  labelKey: 'toolText', fallback: 'Text', icon: ICON_TEXT },
	];

	const DEFAULT_TOOL = 'select';
	const TOOL_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));

	function getToolDef(id) { return TOOL_BY_ID.get(id) || null; }

	// ---- top-level slot layout ------------------------------------------

	const SLOT_ORDER = ['select', 'shapes', 'lines', 'pen', 'text'];

	/** Default tool shown on each dropdown slot before user picks one. */
	const DROPDOWN_DEFAULT_TOOL = {
		shapes: 'rectangle',
		lines: 'arrow',
	};

	const DROPDOWN_LABEL = {
		shapes: { key: 'toolGroupShapes', fallback: 'Shapes' },
		lines: { key: 'toolGroupLines', fallback: 'Lines' },
	};

	const SUBGROUP_LABEL = {
		basic:         { key: 'toolSubgroupBasic',         fallback: 'Basic / General' },
		flowchart:     { key: 'toolSubgroupFlowchart',     fallback: 'Flowchart' },
		containers:    { key: 'toolSubgroupContainers',    fallback: 'Containers' },
		dataDocuments: { key: 'toolSubgroupDataDocuments', fallback: 'Data / Documents' },
		architecture:  { key: 'toolSubgroupArchitecture',  fallback: 'Architecture' },
		devices:       { key: 'toolSubgroupDevices',       fallback: 'Devices' },
		notes:         { key: 'toolSubgroupNotes',         fallback: 'Notes' },
		uml:           { key: 'toolSubgroupUml',           fallback: 'UML connectors' },
	};

	const SUBGROUP_ORDER_SHAPES = ['basic', 'flowchart', 'containers', 'dataDocuments', 'architecture', 'devices', 'notes'];
	const SUBGROUP_ORDER_LINES = ['basic', 'uml'];

	// ---- DOM helpers ----------------------------------------------------

	function makeIconButton(tool, onClick) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'tool-btn icon-btn';
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

	function renderTile(tool, activeToolId, onPick) {
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
		return btn;
	}

	/**
	 * Builds the popover body: grouped grids of tiles, one per subgroup.
	 */
	function buildDropdownContent(groupId, activeToolId, onPick) {
		const root = document.createElement('div');
		root.className = 'toolbar-popover-content';
		root.dataset.group = groupId;

		const body = document.createElement('div');
		body.className = 'toolbar-popover-body';
		root.appendChild(body);

		const groupTools = TOOLS.filter((tool) => tool.group === groupId);
		const subgroupOrder = groupId === 'shapes' ? SUBGROUP_ORDER_SHAPES : SUBGROUP_ORDER_LINES;
		for (const subgroup of subgroupOrder) {
			const tools = groupTools.filter((tool) => tool.subgroup === subgroup);
			if (tools.length === 0) continue;
			const heading = document.createElement('div');
			heading.className = 'toolbar-popover-heading';
			const meta = SUBGROUP_LABEL[subgroup] || { fallback: subgroup };
			heading.textContent = t(meta.key, meta.fallback);
			body.appendChild(heading);
			const grid = document.createElement('div');
			grid.className = 'toolbar-popover-grid';
			for (const tool of tools) {
				grid.appendChild(renderTile(tool, activeToolId, onPick));
			}
			body.appendChild(grid);
		}

		return root;
	}

	// ---- mount -----------------------------------------------------------

	function mount(host, onToolChange) {
		const Dropdown = window.CanvasNotes && window.CanvasNotes.EditorDropdown;
		host.innerHTML = '';
		let active = DEFAULT_TOOL;

		// Per-dropdown state: { rootBtn, iconHost, currentToolId, groupId }
		const dropdowns = new Map();
		// Standalone (non-dropdown) buttons by id, for highlighting.
		const flatButtons = new Map();

		function setActive(id) {
			active = id;
			for (const [tid, btn] of flatButtons.entries()) {
				btn.classList.toggle('active', tid === id);
			}
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
			if (!dd || !Dropdown) return;
			if (Dropdown.isOpen()) {
				// Same anchor pressed again - close it.
				Dropdown.close();
				return;
			}
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
			const meta = DROPDOWN_LABEL[groupId];
			const initialToolId = DROPDOWN_DEFAULT_TOOL[groupId];
			const initialDef = getToolDef(initialToolId);
			const label = t(meta.key, meta.fallback);

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

			// Click semantics:
			//   - if the active tool already belongs to this group, click
			//     opens the popover for re-pick;
			//   - otherwise click activates the dropdown's current tool.
			rootBtn.addEventListener('click', () => {
				const def = getToolDef(active);
				if (def && def.group === groupId) {
					openDropdown(groupId);
				} else {
					setActive(dd.currentToolId);
				}
			});
			// Caret always opens the popover.
			caret.addEventListener('click', (evt) => {
				evt.stopPropagation();
				openDropdown(groupId);
			});

			return rootBtn;
		}

		const slotElements = [];
		for (const slot of SLOT_ORDER) {
			if (slot === 'shapes' || slot === 'pen') {
				if (slotElements.length > 0) host.appendChild(makeSeparator());
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
		return { getActive: () => active, setActive };
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.Toolbar = { TOOLS, DEFAULT_TOOL, mount, getToolDef };
})();
