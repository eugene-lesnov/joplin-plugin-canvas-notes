import joplin from 'api';

/**
 * "Open Canvas Editor" command.
 *
 * With joplin.views.editors the editor view becomes available automatically
 * for any note that passes onActivationCheck (i.e. Canvas Notes). This
 * command just asks Joplin to switch to the plugin editor for the current
 * note. If the current note is not a Canvas Note, Joplin will keep the
 * default editor.
 */
export async function registerOpenCanvasCommand(commandName: string): Promise<void> {
	await joplin.commands.register({
		name: commandName,
		label: 'Open Canvas Editor',
		execute: async () => {
			try {
				await joplin.commands.execute('showEditorPlugin');
			} catch (e) {
				// eslint-disable-next-line no-console
				console.error('[Canvas Notes] openCanvasEditor failed:', e);
				throw e;
			}
		},
	});
}
