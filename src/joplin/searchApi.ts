/**
 * Note/todo search for the Canvas Editor card picker.
 *
 * Uses Joplin's `search` endpoint with the standard query syntax.
 * In addition to the title-only search performed by the picker itself
 * (the title: filter is built on the webview side), we always request
 * the `body` field so we can produce a short preview snippet for cards.
 */

import joplin from 'api';

const SEARCH_FIELDS = ['id', 'title', 'is_todo', 'todo_completed', 'body'];
const DEFAULT_LIMIT = 20;
const PREVIEW_MAX_CHARS = 160;

/** Public, lean shape exposed to the rest of the plugin/webview. */
export interface NoteSearchItem {
	id: string;
	title: string;
	isTodo: boolean;
	todoCompleted: boolean;
	/** Short, plain-text snippet of the body. Empty string when no body. */
	preview: string;
}

interface RawSearchItem {
	id: string;
	title: string;
	is_todo: number;
	todo_completed: number;
	body?: string;
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
 * Used to detect broken card links and to refresh card previews.
 */
export async function getNoteSummaryById(noteId: string): Promise<NoteSearchItem | null> {
	if (!noteId) return null;
	try {
		const raw: RawSearchItem = await joplin.data.get(['notes', noteId], {
			fields: SEARCH_FIELDS,
		});
		if (!raw || !raw.id) return null;
		return toItem(raw);
	} catch {
		// Joplin returns 404 for missing notes; treat any error as "missing".
		return null;
	}
}

function toItem(raw: RawSearchItem): NoteSearchItem {
	return {
		id: raw.id,
		title: raw.title || '(untitled)',
		isTodo: !!raw.is_todo,
		todoCompleted: !!raw.todo_completed,
		preview: buildPreview(raw.body),
	};
}

/**
 * Reduces a Joplin note body to a one-paragraph plain-text snippet.
 * Strips the most common markdown noise so the snippet looks like
 * regular text. We don't aim for perfect markdown rendering here.
 */
function buildPreview(body: string | undefined): string {
	if (!body) return '';
	const flat = body
		// Remove fenced code blocks.
		.replace(/```[\s\S]*?```/g, ' ')
		// Inline code.
		.replace(/`[^`]*`/g, ' ')
		// Images and links: keep the visible text.
		.replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
		// HTML comments (canvas marker etc.).
		.replace(/<!--[\s\S]*?-->/g, ' ')
		// HTML tags.
		.replace(/<[^>]+>/g, ' ')
		// Heading markers and list bullets at line start.
		.replace(/^[ \t]*#+\s+/gm, '')
		.replace(/^[ \t]*[-*+]\s+/gm, '')
		.replace(/^[ \t]*\d+\.\s+/gm, '')
		// Emphasis markers.
		.replace(/[*_~]+/g, '')
		// Whitespace cleanup.
		.replace(/\s+/g, ' ')
		.trim();

	if (flat.length <= PREVIEW_MAX_CHARS) return flat;
	return `${flat.slice(0, PREVIEW_MAX_CHARS - 1).trimEnd()}\u2026`;
}
