/**
 * Thin wrapper around joplin.data and joplin.commands for note operations.
 * Keeps callers free from string-path noise and gives a typed surface.
 */

import joplin from 'api';

/** Subset of fields we actually care about. */
export interface NoteSummary {
	id: string;
	title: string;
	body: string;
	parent_id: string;
	is_todo: number;
	todo_completed: number;
}

const NOTE_FIELDS = ['id', 'title', 'body', 'parent_id', 'is_todo', 'todo_completed'];

/**
 * Creates a regular Joplin note. If parentId is omitted, Joplin places the
 * note into the currently selected folder.
 */
export async function createNote(
	title: string,
	body: string,
	parentId?: string,
): Promise<NoteSummary> {
	const payload: Record<string, unknown> = { title, body };
	if (parentId) payload.parent_id = parentId;
	const created: NoteSummary = await joplin.data.post(['notes'], null, payload);
	if (!created || typeof created.id !== 'string') {
		throw new Error('Joplin did not return a note id on create');
	}
	return created;
}

/** Loads a note with the standard set of fields. */
export async function getNote(noteId: string): Promise<NoteSummary> {
	if (!noteId) throw new Error('getNote: noteId is required');
	return joplin.data.get(['notes', noteId], { fields: NOTE_FIELDS });
}

/** Updates the body of an existing note. */
export async function updateNoteBody(noteId: string, body: string): Promise<void> {
	if (!noteId) throw new Error('updateNoteBody: noteId is required');
	await joplin.data.put(['notes', noteId], null, { body });
}

/**
 * Returns the currently selected note or null when none is selected.
 * Joplin's selectedNote() may return undefined; we normalize to null.
 */
export async function getSelectedNote(): Promise<NoteSummary | null> {
	const note = await joplin.workspace.selectedNote();
	return note ? (note as NoteSummary) : null;
}

/**
 * Opens a note in the main editor by id.
 * Uses the built-in 'openNote' command.
 */
export async function openNote(noteId: string): Promise<void> {
	if (!noteId) throw new Error('openNote: noteId is required');
	await joplin.commands.execute('openNote', noteId);
}
