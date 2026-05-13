/**
 * Note/todo search for the Canvas Editor card picker.
 *
 * Uses Joplin's `search` endpoint with the standard query syntax.
 * The title: filter is built on the webview side; here we only fetch
 * the metadata required to render a card (id, title, todo state).
 */

import joplin from 'api';

const SEARCH_FIELDS = ['id', 'title', 'is_todo', 'todo_completed'];
const DEFAULT_LIMIT = 20;

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
 * Searches notes by query. An empty query returns an empty list -
 * Joplin's search endpoint rejects empty queries.
 */
export async function searchNotes(
	query: string,
	limit: number = DEFAULT_LIMIT,
): Promise<NoteSearchItem[]> {
	const trimmed = (query || '').trim();
	if (!trimmed) return [];

	const response = await joplin.data.get(['search'], {
		query: trimmed,
		type: 'note',
		fields: SEARCH_FIELDS,
		limit,
	});

	const raw: RawSearchItem[] = (response && response.items) || [];
	return raw.map(toItem);
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
