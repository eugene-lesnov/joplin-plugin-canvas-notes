/* eslint-disable no-undef */
/**
 * Lightweight reusable popover/dropdown.
 *
 * Used by the toolbar to open the Shapes / Lines tool palettes. Pure DOM,
 * no framework. Handles:
 *   - positioning under the anchor;
 *   - click-outside closing;
 *   - Escape closing;
 *   - keeping a single popover instance open at a time (opening one
 *     closes any other).
 *
 * Exposed as `window.CanvasNotes.EditorDropdown`.
 */

(function () {
	'use strict';

	let currentPopover = null;

	function closeCurrent() {
		if (!currentPopover) return;
		const { node, onOutside } = currentPopover;
		document.removeEventListener('mousedown', onOutside, true);
		document.removeEventListener('keydown', onKey, true);
		if (node && node.parentNode) node.parentNode.removeChild(node);
		currentPopover = null;
	}

	function onKey(evt) {
		if (evt.key === 'Escape' && currentPopover) {
			evt.preventDefault();
			evt.stopPropagation();
			closeCurrent();
		}
	}

	/**
	 * Opens a popover anchored to `anchorEl`. `buildContent(close)` is
	 * called once and returns the popover's inner DOM; call `close()` from
	 * inside it to dismiss the popover (e.g. after the user picks an item).
	 */
	function open(anchorEl, buildContent) {
		closeCurrent();

		const popover = document.createElement('div');
		popover.className = 'toolbar-popover';
		popover.setAttribute('role', 'menu');
		// Hide before measuring so we never flash at a wrong position.
		popover.style.visibility = 'hidden';
		document.body.appendChild(popover);

		const close = () => closeCurrent();
		const content = buildContent(close);
		if (content) popover.appendChild(content);

		// Position below the anchor; if the popover would overflow the
		// viewport on the right, slide it left so the right edge stays in.
		const rect = anchorEl.getBoundingClientRect();
		const pw = popover.offsetWidth;
		const ph = popover.offsetHeight;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		let left = rect.left;
		let top = rect.bottom + 4;
		if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
		if (top + ph > vh - 8) top = Math.max(8, rect.top - ph - 4);
		popover.style.position = 'fixed';
		popover.style.left = `${left}px`;
		popover.style.top = `${top}px`;
		popover.style.visibility = '';

		const onOutside = (evt) => {
			if (popover.contains(evt.target) || anchorEl.contains(evt.target)) return;
			closeCurrent();
		};
		document.addEventListener('mousedown', onOutside, true);
		document.addEventListener('keydown', onKey, true);

		currentPopover = { node: popover, onOutside };
		return { close };
	}

	function isOpen() { return !!currentPopover; }

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.EditorDropdown = { open, close: closeCurrent, isOpen };
})();
