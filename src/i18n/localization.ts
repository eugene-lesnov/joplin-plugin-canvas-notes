/**
 * Backend (main plugin process) localization.
 *
 * Strings are looked up by key and merged on top of the English defaults.
 * The active language must be set explicitly via setLocale() because the
 * Joplin plugin process has no reliable navigator.languages source; the
 * caller (index.ts) reads the locale from joplin.settings.globalValue.
 *
 * Mirrored on the webview side by src/panel/webview/i18n.js with its own
 * dictionary, since the two execution contexts cannot share modules.
 */

export interface AppLocalization {
	// Tools menu
	toolsSubmenuLabel: string;

	// Commands
	createCanvasNoteLabel: string;
	openCanvasEditorLabel: string;

	// Default note title used when creating a Canvas Note
	defaultCanvasNoteTitle: string;
	canvasNoteTitlePrefix: string;

	// canvasLoader.ts errors
	errorNoNoteId: string;
	errorNotACanvasNote: string;
	errorNoEmbeddedResource: string;
	errorSvgResourceUnreadable: string;
	errorMetadataMissing: string;
	errorMetadataUnreadable: string;

	// webviewMessageRouter.ts errors
	errorNoActiveCanvas: string;
	errorLinkedNoteMissing: string;
	errorLinkedNoteTrashed: string;
	errorUnknownMessage: string;

	// editorController.ts errors
	errorLoadCanvasFailed: string;

	// Card body labels (svgRenderers.ts)
	cardTypeNote: string;
	cardTypeTask: string;
	cardTypeTaskDone: string;
	cardBrokenLink: string;
	cardTrashed: string;
}

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

const defaultStrings: AppLocalization = {
	toolsSubmenuLabel: "Canvas Notes",

	createCanvasNoteLabel: "Create Canvas Note",
	openCanvasEditorLabel: "Open Canvas Editor",

	defaultCanvasNoteTitle: "Untitled",
	canvasNoteTitlePrefix: "Canvas: {{title}}",

	errorNoNoteId: "No note id provided",
	errorNotACanvasNote:
		"This note is not a Canvas Note. Use Tools -> Canvas Notes -> Create Canvas Note.",
	errorNoEmbeddedResource:
		"Canvas Note body has no embedded SVG resource. The body has likely been edited manually.",
	errorSvgResourceUnreadable: "SVG resource not found or unreadable ({{reason}}).",
	errorMetadataMissing: "Canvas metadata is missing or corrupted.",
	errorMetadataUnreadable: "Cannot read canvas data.",

	errorNoActiveCanvas: "No active canvas to save into",
	errorLinkedNoteMissing: "Linked note no longer exists",
	errorLinkedNoteTrashed: "Linked note is in the trash",
	errorUnknownMessage: "Unknown message: {{message}}",

	errorLoadCanvasFailed: "Failed to load canvas: {{reason}}",

	cardTypeNote: "Note",
	cardTypeTask: "Task",
	cardTypeTaskDone: "Task (done)",
	cardBrokenLink: "broken link",
	cardTrashed: "in trash",
};

const localizations: Record<string, Partial<AppLocalization>> = {
	ru: {
		toolsSubmenuLabel: "Canvas Notes",

		createCanvasNoteLabel: "Создать Canvas-заметку",
		openCanvasEditorLabel: "Открыть Canvas-редактор",

		defaultCanvasNoteTitle: "Без названия",
		canvasNoteTitlePrefix: "Canvas: {{title}}",

		errorNoNoteId: "Не указан id заметки",
		errorNotACanvasNote:
			"Эта заметка не является Canvas-заметкой. Используйте Инструменты -> Canvas Notes -> Создать Canvas-заметку.",
		errorNoEmbeddedResource:
			"В теле Canvas-заметки нет встроенного SVG-ресурса. Скорее всего, тело было отредактировано вручную.",
		errorSvgResourceUnreadable: "SVG-ресурс не найден или не читается ({{reason}}).",
		errorMetadataMissing: "Метаданные Canvas отсутствуют или повреждены.",
		errorMetadataUnreadable: "Не удалось прочитать данные Canvas.",

		errorNoActiveCanvas: "Нет активного Canvas для сохранения",
		errorLinkedNoteMissing: "Связанная заметка больше не существует",
		errorLinkedNoteTrashed: "Связанная заметка находится в корзине",
		errorUnknownMessage: "Неизвестное сообщение: {{message}}",

		errorLoadCanvasFailed: "Не удалось загрузить Canvas: {{reason}}",

		cardTypeNote: "Заметка",
		cardTypeTask: "Задача",
		cardTypeTaskDone: "Задача (выполнена)",
		cardBrokenLink: "связь нарушена",
		cardTrashed: "в корзине",
	},
};

let supportedLanguages: string[] = [];

const strings: AppLocalization = { ...defaultStrings };

const normalizeLocale = (locale: string): string => locale.replace("_", "-");

const getLanguageCode = (locale: string): string | undefined => {
	const localeSeparatorIndex = locale.indexOf("-");

	return localeSeparatorIndex === -1 ? undefined : locale.substring(0, localeSeparatorIndex);
};

const getSupportedLanguages = (locales: readonly string[]): string[] => {
	const languages: string[] = [];

	for (const locale of locales) {
		if (!locale) continue;
		const normalizedLocale = normalizeLocale(locale);
		languages.push(normalizedLocale);

		const languageCode = getLanguageCode(normalizedLocale);

		if (languageCode) {
			languages.push(languageCode);
		}
	}

	return languages;
};

const findLocalization = (languages: readonly string[]): Partial<AppLocalization> => {
	for (const language of languages) {
		const localization = localizations[language];

		if (localization) {
			return localization;
		}
	}

	return {};
};

const applyLocalization = (localization: Partial<AppLocalization>) => {
	Object.assign(strings, defaultStrings, localization);
};

export const setLocale = (supportedLocales: readonly string[] | string) => {
	const locales = typeof supportedLocales === "string" ? [supportedLocales] : supportedLocales;
	const languages = getSupportedLanguages(locales);

	supportedLanguages = languages;
	applyLocalization(findLocalization(languages));
};

export const getLocales = (): string[] => {
	return [...supportedLanguages];
};

export const formatLocalizedString = (
	template: string,
	values: Record<string, string | number>,
): string => {
	return template.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
		const value = values[key];
		return value === undefined ? match : String(value);
	});
};

export default strings;
