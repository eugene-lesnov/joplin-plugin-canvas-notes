/* eslint-disable no-undef */
/**
 * One-shot "fit canvas to viewport" helper used when a fresh, empty
 * Canvas Note is opened for the very first time.
 *
 * Hard requirements (all must hold):
 *   - the document has no elements;
 *   - meta.createdAt === meta.updatedAt (signals: never saved by user yet);
 *   - the stage layout is bigger than the current canvas size.
 *
 * The fit only ENLARGES the canvas, never shrinks it. This avoids the
 * "shrinks every time you open it" feedback loop on existing notes
 * where the saved canvas was slightly larger than the visible stage.
 *
 * Exposed as `window.CanvasNotes.EditorCanvasFit`.
 */

(function () {
	'use strict';

	const C = window.CanvasNotes && window.CanvasNotes.EditorConstants;
	const MIN_CANVAS_SIZE = (C && C.MIN_CANVAS_SIZE) || 100;
	/** Stage padding * 2 in pixels (matches CSS). */
	const STAGE_PAD = 16;

	function isUntouchedDocument(d) {
		if (!d) return false;
		if (d.elements && d.elements.length > 0) return false;
		const meta = d.meta;
		if (!meta || !meta.createdAt || !meta.updatedAt) return false;
		return meta.createdAt === meta.updatedAt;
	}

	/**
	 * Creates a fit-to-viewport "engine" tied to the given stage element.
	 * The engine observes stage resize events until either the fit is
	 * applied successfully OR the user starts editing the document.
	 */
	function createFit(stage, hooks) {
		let observer = null;
		let triggered = false;

		function dispose() {
			if (!observer) return;
			try { observer.disconnect(); } catch (_) { /* ignore */ }
			observer = null;
		}

		/** Returns { width, height } if a fit applies, else null. */
		function tryEnlarge(currentDoc) {
			if (!currentDoc || !stage) return null;
			const rect = stage.getBoundingClientRect();
			const availW = Math.floor(rect.width  - STAGE_PAD);
			const availH = Math.floor(rect.height - STAGE_PAD);
			if (availW < MIN_CANVAS_SIZE || availH < MIN_CANVAS_SIZE) return null;
			const nextW = Math.max(currentDoc.width, availW);
			const nextH = Math.max(currentDoc.height, availH);
			if (nextW === currentDoc.width && nextH === currentDoc.height) {
				// Already fits; report success without changes.
				return { width: nextW, height: nextH, changed: false };
			}
			return { width: nextW, height: nextH, changed: true };
		}

		function start(currentDoc) {
			dispose();
			triggered = false;
			if (!isUntouchedDocument(currentDoc)) return;
			if (!stage) return;

			const first = tryEnlarge(currentDoc);
			if (first) {
				triggered = true;
				hooks.applyResize(first);
				return;
			}

			if (typeof ResizeObserver === 'undefined') return;
			observer = new ResizeObserver(() => {
				if (triggered) return;
				const liveDoc = hooks.getDoc();
				if (!isUntouchedDocument(liveDoc)) {
					dispose();
					return;
				}
				const result = tryEnlarge(liveDoc);
				if (result) {
					triggered = true;
					hooks.applyResize(result);
					dispose();
				}
			});
			observer.observe(stage);
		}

		return { start, dispose, isUntouchedDocument };
	}

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.EditorCanvasFit = { createFit, isUntouchedDocument };
})();
