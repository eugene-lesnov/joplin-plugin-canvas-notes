/* eslint-disable no-undef */
/**
 * Note picker overlay.
 *
 * Shows a modal with a search input and a list of matching Joplin notes.
 * Search runs against backend via webviewApi.postMessage({type:'searchNotes'})
 * and is debounced. On selection, the picker calls back with the chosen
 * note summary; the editor decides whether to spawn a noteCard or todoCard.
 *
 * Exposed as global CanvasNotes.NotePicker.
 */

(function () {
	'use strict';

	const DEBOUNCE_MS = 200;

	function t(key, fallback) {
		const i18n = window.CanvasNotes && window.CanvasNotes.t;
		return typeof i18n === 'function' ? i18n(key) : fallback;
	}

	let onPickedCb = null;
	let debounceHandle = null;
	let lastQueryToken = 0;
	let activeIndex = -1;
	let items = [];

	function $(id) { return document.getElementById(id); }

	function isOpen() {
		const root = $('note-picker');
		return !!(root && root.classList.contains('is-open'));
	}

	function open(onPicked) {
		onPickedCb = typeof onPicked === 'function' ? onPicked : null;
		const root = $('note-picker');
		const input = $('picker-input');
		const empty = $('picker-empty');
		const results = $('picker-results');
		if (!root || !input) return;

		root.classList.add('is-open');
		input.value = '';
		results.innerHTML = '';
		empty.hidden = true;
		activeIndex = -1;
		items = [];
		// Defer focus to next tick so the overlay is fully visible.
		setTimeout(() => input.focus(), 0);
	}

	function close() {
		const root = $('note-picker');
		if (root) root.classList.remove('is-open');
		onPickedCb = null;
		items = [];
		activeIndex = -1;
	}

	async function runSearch(query) {
		const token = ++lastQueryToken;
		const empty = $('picker-empty');
		const results = $('picker-results');
		const trimmed = (query || '').trim();
		if (!trimmed) {
			items = [];
			results.innerHTML = '';
			empty.hidden = true;
			return;
		}
		// Send the raw user query - the backend builds the proper Joplin
		// search expression and handles the fallback to the recent-notes
		// list when FTS returns nothing (e.g. for freshly created notes).
		const res = await postMessage({ type: 'searchNotes', query: trimmed });
		// Out-of-order safeguard: ignore stale responses.
		if (token !== lastQueryToken) return;
		const list = (res && res.ok && Array.isArray(res.items)) ? res.items : [];
		renderResults(list);
	}

	function renderResults(list) {
		items = list;
		activeIndex = list.length > 0 ? 0 : -1;
		const results = $('picker-results');
		const empty = $('picker-empty');
		results.innerHTML = '';
		if (list.length === 0) {
			empty.hidden = false;
			return;
		}
		empty.hidden = true;

		list.forEach((it, idx) => {
			const li = document.createElement('li');
			li.className = 'picker-item' + (idx === activeIndex ? ' active' : '');
			li.dataset.id = it.id;

			const badge = document.createElement('span');
			if (it.isTodo) {
				badge.className = 'picker-badge todo' + (it.todoCompleted ? ' done' : '');
				badge.textContent = it.todoCompleted
					? t('pickerBadgeDone', 'done')
					: t('pickerBadgeTodo', 'todo');
			} else {
				badge.className = 'picker-badge';
				badge.textContent = t('pickerBadgeNote', 'note');
			}
			li.appendChild(badge);

			const title = document.createElement('span');
			title.textContent = it.title || t('pickerUntitled', '(untitled)');
			li.appendChild(title);

			li.addEventListener('mouseenter', () => setActive(idx));
			// Use mousedown: the overlay backdrop also listens on mousedown to
			// close itself, and a focus shift between mousedown and click can
			// otherwise eat the click event in some webview environments.
			li.addEventListener('mousedown', (e) => {
				e.preventDefault();
				e.stopPropagation();
				choose(idx);
			});
			results.appendChild(li);
		});
	}

	function setActive(idx) {
		const results = $('picker-results');
		if (!results) return;
		activeIndex = idx;
		const children = results.querySelectorAll('.picker-item');
		children.forEach((el, i) => el.classList.toggle('active', i === idx));
	}

	function choose(idx) {
		const item = items[idx];
		if (!item || !onPickedCb) { close(); return; }
		const cb = onPickedCb;
		close();
		cb(item);
	}

	function onInput(evt) {
		const value = evt.target.value;
		if (debounceHandle !== null) clearTimeout(debounceHandle);
		debounceHandle = setTimeout(() => runSearch(value), DEBOUNCE_MS);
	}

	function onKeyDown(evt) {
		if (!isOpen()) return;
		if (evt.key === 'Escape') {
			close();
			evt.preventDefault();
			return;
		}
		if (evt.key === 'ArrowDown') {
			if (items.length > 0) setActive(Math.min(activeIndex + 1, items.length - 1));
			evt.preventDefault();
			return;
		}
		if (evt.key === 'ArrowUp') {
			if (items.length > 0) setActive(Math.max(activeIndex - 1, 0));
			evt.preventDefault();
			return;
		}
		if (evt.key === 'Enter') {
			if (activeIndex >= 0) choose(activeIndex);
			evt.preventDefault();
		}
	}

	async function postMessage(message) {
		if (typeof webviewApi === 'undefined' || !webviewApi.postMessage) return null;
		try {
			return await webviewApi.postMessage(message);
		} catch (e) {
			console.error('[Canvas Notes] picker postMessage failed:', e);
			return null;
		}
	}

	function bootstrap() {
		const input = $('picker-input');
		const closeBtn = $('picker-close');
		const overlay = $('note-picker');
		if (input) input.addEventListener('input', onInput);
		if (closeBtn) closeBtn.addEventListener('click', close);
		if (overlay) {
			// Click on backdrop (not on modal) closes the picker. Compare
			// against currentTarget so any descendant click does not trigger.
			overlay.addEventListener('mousedown', (e) => {
				if (e.target === e.currentTarget) close();
			});
		}
		document.addEventListener('keydown', onKeyDown);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
	} else {
		bootstrap();
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.NotePicker = { open, close };
})();
