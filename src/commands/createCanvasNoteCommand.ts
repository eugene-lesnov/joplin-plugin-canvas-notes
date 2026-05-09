import joplin from 'api';
import { createEmptyCanvas } from '../canvas/canvasModel';
import { serializeCanvasToSvg } from '../canvas/svgSerializer';
import { createNote, openNote } from '../joplin/notesApi';
import { buildCanvasNoteBody } from '../joplin/noteBodyUtils';
import { createSvgResource } from '../joplin/resourcesApi';

const DEFAULT_TITLE = 'Untitled';
const RESOURCE_TITLE = 'canvas';

/**
 * Registers the "Create Canvas Note" command.
 *
 * Pipeline:
 *   1. build empty CanvasDocument;
 *   2. serialize it to SVG (with embedded JSON metadata);
 *   3. create an SVG resource in Joplin;
 *   4. create a note with the canonical body (canvas marker + embed);
 *   5. open the new note and switch to the Canvas editor view.
 */
export async function registerCreateCanvasNoteCommand(commandName: string): Promise<void> {
	await joplin.commands.register({
		name: commandName,
		label: 'Create Canvas Note',
		execute: async () => {
			try {
				const doc = createEmptyCanvas();
				const svg = serializeCanvasToSvg(doc);

				const resourceId = await createSvgResource(svg, RESOURCE_TITLE);
				const body = buildCanvasNoteBody(DEFAULT_TITLE, resourceId);
				const note = await createNote(`Canvas: ${DEFAULT_TITLE}`, body);

				await openNote(note.id);
				// Programmatically switch to our editor view for the new note.
				try {
					await joplin.commands.execute('showEditorPlugin');
				} catch (e) {
					// Some environments may not expose this command; non-fatal.
					// eslint-disable-next-line no-console
					console.warn('[Canvas Notes] showEditorPlugin not available:', e);
				}

				// eslint-disable-next-line no-console
				console.info(`[Canvas Notes] created note=${note.id} resource=${resourceId}`);
			} catch (e) {
				// eslint-disable-next-line no-console
				console.error('[Canvas Notes] createCanvasNote failed:', e);
				throw e;
			}
		},
	});
}
