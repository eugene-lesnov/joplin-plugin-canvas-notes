import joplin from 'api';
import { MenuItemLocation } from 'api/types';
import { registerCreateCanvasNoteCommand } from './commands/createCanvasNoteCommand';
import { registerOpenCanvasCommand } from './commands/openCanvasCommand';
import { registerCanvasEditor } from './panel/editorController';

// Plugin-wide command identifiers
const CMD_CREATE_CANVAS_NOTE = 'canvasNotes.createCanvasNote';
const CMD_OPEN_CANVAS_EDITOR = 'canvasNotes.openCanvasEditor';

// Sub-menu identifier under Tools menu
const SUBMENU_ID = 'canvasNotes.toolsSubmenu';
const SUBMENU_LABEL = 'Canvas Notes';

joplin.plugins.register({
	onStart: async function () {
		// 1. Register the editor view (joplin.views.editors).
		//    It activates automatically for notes that match isCanvasNoteBody.
		await registerCanvasEditor();

		// 2. Register backend commands.
		await registerCreateCanvasNoteCommand(CMD_CREATE_CANVAS_NOTE);
		await registerOpenCanvasCommand(CMD_OPEN_CANVAS_EDITOR);

		// 3. Build Tools -> Canvas Notes submenu.
		await joplin.views.menus.create(
			SUBMENU_ID,
			SUBMENU_LABEL,
			[
				{ commandName: CMD_CREATE_CANVAS_NOTE, label: 'Create Canvas Note' },
				{ commandName: CMD_OPEN_CANVAS_EDITOR, label: 'Open Canvas Editor' },
			],
			MenuItemLocation.Tools,
		);

		// eslint-disable-next-line no-console
		console.info('[Canvas Notes] plugin started');
	},
});
