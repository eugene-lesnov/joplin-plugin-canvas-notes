import joplin from 'api';
import { createEmptyCanvas } from '../canvas/canvasModel';
import { serializeCanvasToSvg } from '../canvas/svgSerializer';
import strings, { formatLocalizedString } from '../i18n/localization';
import { createNote, openNote } from '../joplin/notesApi';
import { buildCanvasNoteBody } from '../joplin/noteBodyUtils';
import { createSvgResource } from '../joplin/resourcesApi';

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
		label: strings.createCanvasNoteLabel,
		execute: async () => {
			try {
				const doc = createEmptyCanvas();
				const svg = serializeCanvasToSvg(doc);

				const defaultTitle = strings.defaultCanvasNoteTitle;
				const resourceId = await createSvgResource(svg, RESOURCE_TITLE);
				const body = buildCanvasNoteBody(defaultTitle, resourceId);
				const noteTitle = formatLocalizedString(strings.canvasNoteTitlePrefix, { title: defaultTitle });
				const note = await createNote(noteTitle, body);

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
