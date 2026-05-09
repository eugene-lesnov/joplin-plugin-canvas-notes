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
		if (!query.trim()) {
			items = [];
			results.innerHTML = '';
			empty.hidden = true;
			return;
		}
		// Joplin's search endpoint searches title+body by default. We want
		// title-only matching, which is requested via the `title:` field
		// modifier. We also append a wildcard so partial matches work for
		// queries shorter than a full word.
		const joplinQuery = buildTitleQuery(query);
		const res = await postMessage({ type: 'searchNotes', query: joplinQuery });
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
				badge.textContent = it.todoCompleted ? 'done' : 'todo';
			} else {
				badge.className = 'picker-badge';
				badge.textContent = 'note';
			}
			li.appendChild(badge);

			const title = document.createElement('span');
			title.textContent = it.title || '(untitled)';
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

	/**
	 * Builds a Joplin search query that matches title only. We escape
	 * Joplin search operators that could otherwise be misinterpreted, then
	 * wrap the whole phrase in quotes if it contains whitespace, and add
	 * a wildcard for prefix matching.
	 *
	 * Joplin syntax used:
	 *   title:term     - title-only field filter
	 *   title:"two words" - quoted multi-word phrase
	 *   trailing *     - wildcard
	 */
	function buildTitleQuery(raw) {
		const q = (raw || '').trim();
		if (!q) return '';
		// Strip characters that Joplin's parser treats as operators inside a phrase.
		const safe = q.replace(/["]/g, '').trim();
		if (!safe) return '';
		if (/\s/.test(safe)) {
			return `title:"${safe}"*`;
		}
		return `title:${safe}*`;
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
