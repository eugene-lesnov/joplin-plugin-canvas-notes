/**
 * Note/todo search for the Canvas Editor card picker.
 *
 * Builds a title-only FTS5 expression for Joplin's `search` endpoint and,
 * if the FTS index returns nothing (e.g. for a just-created note that
 * the indexer has not picked up yet), falls back to scanning recent
 * notes and filtering by title substring on the Node side.
 */

import joplin from 'api';

const SEARCH_FIELDS = ['id', 'title', 'is_todo', 'todo_completed'];
const DEFAULT_LIMIT = 20;
/**
 * How many recent notes to scan for the title-substring pass. The pass
 * runs in parallel with FTS so freshly created notes show up before the
 * indexer catches up. Capped at 100 - Joplin's REST API maximum.
 */
const RECENT_SCAN_LIMIT = 100;
/** Characters FTS5 treats as operators - we strip them from user input. */
const FTS_OPERATOR_RE = /["():\-*/|]+/g;

/** Public, lean shape exposed to the rest of the plugin/webview. */
export interface NoteSearchItem {
	id: string;
	title: string;
	isTodo: boolean;
	todoCompleted: boolean;
}

/** Full summary of a note used to materialize a canvas card. */
export interface NoteFullSummary extends NoteSearchItem {
	tags: string[];
}

interface RawSearchItem {
	id: string;
	title: string;
	is_todo: number;
	todo_completed: number;
}

interface RawTagItem {
	id: string;
	title: string;
}

/**
 * Searches notes by user-entered query, matching against the title.
 *
 * Runs two passes in parallel and merges them:
 *   1. Recent-notes scan, filtered by case-insensitive title substring.
 *      Catches freshly created notes that the FTS indexer has not yet
 *      picked up - critical, because the indexer can lag by seconds.
 *   2. FTS5 title-only query (`title:tok1* title:tok2*`) against the
 *      Joplin `/search` endpoint, for the rest of the user's library.
 *
 * Recent matches come first so newly created notes are visible at the
 * top; FTS matches fill the remaining slots, deduplicated by id.
 */
export async function searchNotes(
	query: string,
	limit: number = DEFAULT_LIMIT,
): Promise<NoteSearchItem[]> {
	const trimmed = (query || '').trim();
	if (!trimmed) return [];

	const tokens = tokenizeForSearch(trimmed);
	const needles = (tokens.length > 0 ? tokens : [trimmed]).map((t) => t.toLowerCase());
	const ftsQuery = buildTitleQuery(tokens);

	const [recent, fts] = await Promise.all([
		searchRecentByTitle(needles, limit),
		ftsQuery ? searchFts(ftsQuery, limit) : Promise.resolve<RawSearchItem[]>([]),
	]);

	return mergeUnique(recent, fts, limit).map(toItem);
}

/** Runs a single FTS5 title-only search and returns raw items. */
async function searchFts(ftsQuery: string, limit: number): Promise<RawSearchItem[]> {
	const response = await joplin.data.get(['search'], {
		query: ftsQuery,
		type: 'note',
		fields: SEARCH_FIELDS,
		limit,
	});
	return (response && response.items) || [];
}

/** Merges two raw lists, preserving order and dropping duplicates by id. */
function mergeUnique(
	primary: RawSearchItem[],
	secondary: RawSearchItem[],
	limit: number,
): RawSearchItem[] {
	const seen = new Set<string>();
	const out: RawSearchItem[] = [];
	for (const list of [primary, secondary]) {
		for (const item of list) {
			if (!item || !item.id || seen.has(item.id)) continue;
			seen.add(item.id);
			out.push(item);
			if (out.length >= limit) return out;
		}
	}
	return out;
}

/**
 * Splits the raw user input into FTS-safe tokens. Joplin's parser breaks
 * on operator characters, so we replace them with whitespace and discard
 * empty fragments.
 */
function tokenizeForSearch(raw: string): string[] {
	return raw
		.replace(FTS_OPERATOR_RE, ' ')
		.split(/\s+/)
		.filter((t) => t.length > 0);
}

/**
 * Builds a title-only FTS5 expression. Each token gets the `title:` field
 * filter and a trailing `*` for prefix matching, joined by implicit AND.
 * Returns an empty string when there are no usable tokens.
 */
function buildTitleQuery(tokens: string[]): string {
	if (tokens.length === 0) return '';
	return tokens.map((t) => `title:${t}*`).join(' ');
}

/**
 * Pulls the most recently updated notes and filters them by title
 * substring on the Node side. Bypasses the FTS index, so notes created
 * within the indexer's lag window are still discoverable.
 */
async function searchRecentByTitle(needles: string[], limit: number): Promise<RawSearchItem[]> {
	if (needles.length === 0) return [];
	const response = await joplin.data.get(['notes'], {
		fields: SEARCH_FIELDS,
		order_by: 'updated_time',
		order_dir: 'DESC',
		limit: RECENT_SCAN_LIMIT,
	});
	const raw: RawSearchItem[] = (response && response.items) || [];
	const matched: RawSearchItem[] = [];
	for (const note of raw) {
		const title = (note.title || '').toLowerCase();
		if (needles.every((n) => title.includes(n))) {
			matched.push(note);
			if (matched.length >= limit) break;
		}
	}
	return matched;
}

/**
 * Returns a brief summary of a note by id, or null when missing.
 * Used to detect broken card links and to refresh card metadata.
 * Tags are fetched in a separate request because Joplin exposes them
 * via a sub-resource (`/notes/:id/tags`).
 */
export async function getNoteSummaryById(noteId: string): Promise<NoteFullSummary | null> {
	if (!noteId) return null;
	try {
		const raw: RawSearchItem = await joplin.data.get(['notes', noteId], {
			fields: SEARCH_FIELDS,
		});
		if (!raw || !raw.id) return null;
		const tags = await fetchNoteTags(noteId);
		return { ...toItem(raw), tags };
	} catch {
		// Joplin returns 404 for missing notes; treat any error as "missing".
		return null;
	}
}

/**
 * Returns the list of tag titles attached to the note. Pages through
 * Joplin's paginated response so notes with many tags are fully covered.
 * On any error returns an empty list rather than failing the whole card
 * refresh.
 */
async function fetchNoteTags(noteId: string): Promise<string[]> {
	const titles: string[] = [];
	try {
		let page = 1;
		for (;;) {
			const response = await joplin.data.get(['notes', noteId, 'tags'], {
				fields: ['id', 'title'],
				page,
			});
			const items: RawTagItem[] = (response && response.items) || [];
			for (const t of items) if (t && t.title) titles.push(t.title);
			if (!response || !response.has_more) break;
			page += 1;
		}
	} catch {
		return titles;
	}
	return titles;
}

function toItem(raw: RawSearchItem): NoteSearchItem {
	return {
		id: raw.id,
		title: raw.title || '(untitled)',
		isTodo: !!raw.is_todo,
		todoCompleted: !!raw.todo_completed,
	};
}
