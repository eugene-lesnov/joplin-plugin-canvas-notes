/* eslint-disable no-undef */
/**
 * Lightweight context menu for the canvas.
 *
 * The controller passes a list of items to `show(...)`; each item has a
 * label and an action. The menu hides itself on action, on Escape and on
 * any outside mousedown.
 *
 * Exposed as `window.CanvasNotes.EditorContextMenu`.
 */

(function () {
	'use strict';

	let currentEl = null;

	function buildItem(it) {
		const item = document.createElement('div');
		item.className = 'ctx-item';
		if (it.disabled) item.classList.add('is-disabled');
		item.textContent = it.label;
		item.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (it.disabled) return;
			hide();
			it.action();
		});
		return item;
	}

	function show(clientX, clientY, items) {
		hide();
		const menu = document.createElement('div');
		menu.className = 'ctx-menu';
		menu.style.left = `${clientX}px`;
		menu.style.top = `${clientY}px`;
		for (const it of items) menu.appendChild(buildItem(it));

		document.body.appendChild(menu);
		currentEl = menu;

		// Clamp into viewport.
		const rect = menu.getBoundingClientRect();
		if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
		if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;
	}

	function hide() {
		if (!currentEl) return;
		if (currentEl.parentNode) currentEl.parentNode.removeChild(currentEl);
		currentEl = null;
	}

	function isOpen() {
		return !!currentEl;
	}

	function contains(target) {
		return !!currentEl && currentEl.contains(target);
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.EditorContextMenu = { show, hide, isOpen, contains };
})();
