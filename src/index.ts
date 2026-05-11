import joplin from 'api';
import { MenuItemLocation } from 'api/types';
import { registerCreateCanvasNoteCommand } from './commands/createCanvasNoteCommand';
import { registerOpenCanvasCommand } from './commands/openCanvasCommand';
import { registerCanvasEditor } from './panel/editorController';
import strings, { setLocale } from './i18n/localization';

// Plugin-wide command identifiers
const CMD_CREATE_CANVAS_NOTE = 'canvasNotes.createCanvasNote';
const CMD_OPEN_CANVAS_EDITOR = 'canvasNotes.openCanvasEditor';

// Sub-menu identifier under Tools menu
const SUBMENU_ID = 'canvasNotes.toolsSubmenu';

/** Reads the active Joplin UI locale and applies it to the i18n module. */
async function initLocale(): Promise<void> {
	try {
		const locale = await joplin.settings.globalValue('locale');
		if (typeof locale === 'string' && locale.length > 0) {
			setLocale(locale);
		}
	} catch (e) {
		// Non-fatal: fall back to the default English strings.
		// eslint-disable-next-line no-console
		console.warn('[Canvas Notes] failed to read Joplin locale:', e);
	}
}

joplin.plugins.register({
	onStart: async function () {
		// 0. Resolve the UI locale before anything user-facing is registered.
		await initLocale();

		// 1. Register the editor view (joplin.views.editors).
		//    It activates automatically for notes that match isCanvasNoteBody.
		await registerCanvasEditor();

		// 2. Register backend commands.
		await registerCreateCanvasNoteCommand(CMD_CREATE_CANVAS_NOTE);
		await registerOpenCanvasCommand(CMD_OPEN_CANVAS_EDITOR);

		// 3. Build Tools -> Canvas Notes submenu.
		await joplin.views.menus.create(
			SUBMENU_ID,
			strings.toolsSubmenuLabel,
			[
				{ commandName: CMD_CREATE_CANVAS_NOTE, label: strings.createCanvasNoteLabel },
				{ commandName: CMD_OPEN_CANVAS_EDITOR, label: strings.openCanvasEditorLabel },
			],
			MenuItemLocation.Tools,
		);

		// eslint-disable-next-line no-console
		console.info('[Canvas Notes] plugin started');
	},
});
