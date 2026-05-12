/* eslint-disable no-undef */
/**
 * Webview localization.
 *
 * Mirrors the backend i18n module but lives in a separate execution
 * context (Joplin webview), so it has its own dictionary tailored to the
 * UI strings shown by the editor, toolbar, picker, context menu and
 * renderer.
 *
 * Language is auto-detected from navigator.languages on bootstrap; the
 * detection runs once and the resolved strings are exposed via
 * window.CanvasNotes.I18n / window.CanvasNotes.t.
 *
 * Also applies translations to elements marked with [data-i18n] in the
 * HTML, so static labels do not need to be wired up in JS.
 */

(function () {
	'use strict';

	const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

	const defaultStrings = {
		// index.html
		documentTitle: 'Canvas Editor',
		toolbarTitle: 'Canvas Notes',
		btnAddNote: 'Add note/task',
		btnDelete: 'Delete',
		btnSave: 'Save',
		btnFontSmaller: 'Smaller text',
		btnFontLarger: 'Larger text',
		btnZoomOut: 'Zoom out',
		btnZoomIn: 'Zoom in',
		btnZoomReset: 'Reset zoom',
		textControlsLabel: 'Text size',
		zoomGroupLabel: 'Zoom',
		emptyStateHint: 'Add text, shapes, arrows, or linked Joplin notes.',

		// Note picker
		pickerDialogLabel: 'Add note or task',
		pickerTitle: 'Add note or task',
		pickerCloseLabel: 'Close',
		pickerInputPlaceholder: 'Search notes...',
		pickerEmpty: 'No matches',
		pickerBadgeNote: 'note',
		pickerBadgeTodo: 'todo',
		pickerBadgeDone: 'done',
		pickerUntitled: '(untitled)',

		// Toolbar tools
		toolSelect: 'Select',
		// Basic shapes
		toolRectangle: 'Rectangle',
		toolRoundedRectangle: 'Rounded rectangle',
		toolEllipse: 'Ellipse',
		toolTriangle: 'Triangle',
		toolDiamond: 'Diamond',
		toolParallelogram: 'Parallelogram',
		toolTrapezoid: 'Trapezoid',
		toolHexagon: 'Hexagon',
		toolPentagon: 'Pentagon',
		toolStar: 'Star',
		// Flowchart
		toolTerminator: 'Terminator (start / end)',
		toolFlowProcess: 'Process',
		toolFlowDecision: 'Decision',
		toolFlowData: 'Data',
		toolDocument: 'Document',
		toolMultipleDocuments: 'Multiple documents',
		toolManualInput: 'Manual input',
		toolPredefinedProcess: 'Predefined process',
		toolDelay: 'Delay',
		toolOffPageConnector: 'Off-page connector',
		// Architecture
		toolCylinder: 'Cylinder / Database',
		toolQueue: 'Queue',
		toolServer: 'Server / node',
		toolCloud: 'Cloud',
		toolActor: 'Actor',
		toolBrowser: 'Browser',
		toolMobile: 'Mobile',
		toolLaptop: 'Laptop',
		toolDesktop: 'Desktop',
		toolContainer: 'Container',
		toolGear: 'Gear / Service',
		toolLoadBalancer: 'Load balancer',
		toolFirewall: 'Firewall',
		toolLock: 'Lock',
		toolFolder: 'Folder',
		// Notes
		toolCardShape: 'Card',
		toolCallout: 'Callout',
		toolUiStickyNote: 'Sticky note',
		// Lines
		toolLine: 'Solid line',
		toolArrow: 'Arrow',
		toolBiArrow: 'Bidirectional arrow',
		toolLineDashed: 'Dashed line',
		toolLineDotted: 'Dotted line',
		toolLineThick: 'Thick line',
		toolArrowDashed: 'Dashed arrow',
		toolInheritance: 'Inheritance',
		toolRealization: 'Realization',
		toolAggregation: 'Aggregation',
		toolComposition: 'Composition',
		toolDependency: 'Dependency',
		// Misc
		toolPen: 'Pen',
		toolText: 'Text',
		toolGroupShapes: 'Shapes',
		toolGroupLines: 'Lines',
		toolSubgroupBasic: 'Basic',
		toolSubgroupFlowchart: 'Flowchart',
		toolSubgroupArchitecture: 'Architecture',
		toolSubgroupNotes: 'Notes',
		toolSubgroupUml: 'UML connectors',
		toolSearchPlaceholder: 'Search...',
		toolSearchEmpty: 'No matches',

		// Status
		statusReady: 'Ready',
		statusLoaded: 'Loaded',
		statusUnsaved: 'Unsaved changes',
		statusSaving: 'Saving...',
		statusSaved: 'Saved',
		statusError: 'Error',
		statusSaveFailed: 'Save failed',

		// Errors / hints from the editor controller
		errorUnknown: 'Unknown error',
		errorNothingToSave: 'Nothing to save: canvas is not loaded yet',
		errorSaveFailed: 'Save failed',
		errorOpenLinkedNote: 'Failed to open linked note',
		errorPickerUnavailable: 'Note picker is not available',

		// Context menu
		ctxAddNote: 'Add note/task...',
		ctxResetZoom: 'Reset zoom',
		ctxOpenLinkedNote: 'Open linked note',
		ctxBringToFront: 'Bring to front',
		ctxSendToBack: 'Send to back',
		ctxDelete: 'Delete',

		// Prompt modal
		promptCancel: 'Cancel',
		promptOk: 'OK',

		// Renderer
		cardUntitled: '(untitled)',
		cardBrokenLink: 'broken link',
		todoStatusDone: '[x] done',
		todoStatusOpen: '[ ] todo',
	};

	const localizations = {
		ru: {
			documentTitle: 'Canvas-редактор',
			toolbarTitle: 'Canvas Notes',
			btnAddNote: 'Добавить заметку/задачу',
			btnDelete: 'Удалить',
			btnSave: 'Сохранить',
			btnFontSmaller: 'Уменьшить шрифт',
			btnFontLarger: 'Увеличить шрифт',
			btnZoomOut: 'Уменьшить масштаб',
			btnZoomIn: 'Увеличить масштаб',
			btnZoomReset: 'Сбросить масштаб',
			textControlsLabel: 'Размер текста',
			zoomGroupLabel: 'Масштаб',
			emptyStateHint: 'Добавьте текст, фигуры, стрелки или связанные заметки Joplin.',

			pickerDialogLabel: 'Добавить заметку или задачу',
			pickerTitle: 'Добавить заметку или задачу',
			pickerCloseLabel: 'Закрыть',
			pickerInputPlaceholder: 'Поиск заметок...',
			pickerEmpty: 'Ничего не найдено',
			pickerBadgeNote: 'заметка',
			pickerBadgeTodo: 'задача',
			pickerBadgeDone: 'готово',
			pickerUntitled: '(без названия)',

			toolSelect: 'Выделение',
			// Basic shapes
			toolRectangle: 'Прямоугольник',
			toolRoundedRectangle: 'Скруглённый прямоугольник',
			toolEllipse: 'Эллипс',
			toolTriangle: 'Треугольник',
			toolDiamond: 'Ромб',
			toolParallelogram: 'Параллелограмм',
			toolTrapezoid: 'Трапеция',
			toolHexagon: 'Шестиугольник',
			toolPentagon: 'Пятиугольник',
			toolStar: 'Звезда',
			// Flowchart
			toolTerminator: 'Терминатор (старт / конец)',
			toolFlowProcess: 'Процесс',
			toolFlowDecision: 'Условие',
			toolFlowData: 'Данные',
			toolDocument: 'Документ',
			toolMultipleDocuments: 'Несколько документов',
			toolManualInput: 'Ручной ввод',
			toolPredefinedProcess: 'Подпроцесс',
			toolDelay: 'Задержка',
			toolOffPageConnector: 'Переход на другую страницу',
			// Architecture
			toolCylinder: 'Цилиндр / БД',
			toolQueue: 'Очередь',
			toolServer: 'Сервер / нода',
			toolCloud: 'Облако',
			toolActor: 'Актор',
			toolBrowser: 'Браузер',
			toolMobile: 'Телефон',
			toolLaptop: 'Ноутбук',
			toolDesktop: 'Компьютер',
			toolContainer: 'Контейнер',
			toolGear: 'Шестерёнка / Сервис',
			toolLoadBalancer: 'Балансировщик',
			toolFirewall: 'Фаервол',
			toolLock: 'Замок',
			toolFolder: 'Папка',
			// Notes
			toolCardShape: 'Карточка',
			toolCallout: 'Выноска',
			toolUiStickyNote: 'Стикер',
			// Lines
			toolLine: 'Сплошная линия',
			toolArrow: 'Стрелка',
			toolBiArrow: 'Двусторонняя стрелка',
			toolLineDashed: 'Штриховая линия',
			toolLineDotted: 'Пунктирная линия',
			toolLineThick: 'Толстая линия',
			toolArrowDashed: 'Штриховая стрелка',
			toolInheritance: 'Наследование',
			toolRealization: 'Реализация',
			toolAggregation: 'Агрегация',
			toolComposition: 'Композиция',
			toolDependency: 'Зависимость',
			// Misc
			toolPen: 'Карандаш',
			toolText: 'Текст',
			toolGroupShapes: 'Фигуры',
			toolGroupLines: 'Линии',
			toolSubgroupBasic: 'Базовые',
			toolSubgroupFlowchart: 'Блок-схемы',
			toolSubgroupArchitecture: 'Архитектура',
			toolSubgroupNotes: 'Заметки',
			toolSubgroupUml: 'UML-соединители',
			toolSearchPlaceholder: 'Поиск...',
			toolSearchEmpty: 'Ничего не найдено',

			statusReady: 'Готово',
			statusLoaded: 'Загружено',
			statusUnsaved: 'Несохранённые изменения',
			statusSaving: 'Сохранение...',
			statusSaved: 'Сохранено',
			statusError: 'Ошибка',
			statusSaveFailed: 'Ошибка сохранения',

			errorUnknown: 'Неизвестная ошибка',
			errorNothingToSave: 'Нечего сохранять: Canvas ещё не загружен',
			errorSaveFailed: 'Не удалось сохранить',
			errorOpenLinkedNote: 'Не удалось открыть связанную заметку',
			errorPickerUnavailable: 'Поиск заметок недоступен',

			ctxAddNote: 'Добавить заметку/задачу...',
			ctxResetZoom: 'Сбросить масштаб',
			ctxOpenLinkedNote: 'Открыть связанную заметку',
			ctxBringToFront: 'На передний план',
			ctxSendToBack: 'На задний план',
			ctxDelete: 'Удалить',

			promptCancel: 'Отмена',
			promptOk: 'OK',

			cardUntitled: '(без названия)',
			cardBrokenLink: 'связь нарушена',
			todoStatusDone: '[x] готово',
			todoStatusOpen: '[ ] задача',
		},
	};

	const strings = Object.assign({}, defaultStrings);
	let supportedLanguages = [];

	function normalizeLocale(locale) {
		return String(locale || '').replace('_', '-');
	}

	function getLanguageCode(locale) {
		const sepIdx = locale.indexOf('-');
		return sepIdx === -1 ? null : locale.substring(0, sepIdx);
	}

	function getNavigatorLanguages() {
		if (typeof navigator === 'undefined') return [];
		if (navigator.languages && navigator.languages.length > 0) return navigator.languages;
		return navigator.language ? [navigator.language] : [];
	}

	function expandSupportedLanguages(locales) {
		const out = [];
		for (const locale of locales) {
			if (!locale) continue;
			const normalized = normalizeLocale(locale);
			out.push(normalized);
			const code = getLanguageCode(normalized);
			if (code) out.push(code);
		}
		return out;
	}

	function findLocalization(languages) {
		for (const lang of languages) {
			if (Object.prototype.hasOwnProperty.call(localizations, lang)) {
				return localizations[lang];
			}
		}
		return {};
	}

	function applyLocalization(localization) {
		Object.assign(strings, defaultStrings, localization);
	}

	function setLocale(supportedLocales) {
		const locales = typeof supportedLocales === 'string' ? [supportedLocales] : supportedLocales;
		const languages = expandSupportedLanguages(locales || []);
		supportedLanguages = languages;
		applyLocalization(findLocalization(languages));
	}

	function getLocales() {
		return supportedLanguages.slice();
	}

	function t(key, values) {
		const template = Object.prototype.hasOwnProperty.call(strings, key) ? strings[key] : key;
		if (!values) return template;
		return template.replace(PLACEHOLDER_PATTERN, (match, k) => {
			const v = values[k];
			return v === undefined ? match : String(v);
		});
	}

	/**
	 * Walks the DOM and applies translations to elements with the i18n
	 * attributes:
	 *   data-i18n="key"            - sets textContent
	 *   data-i18n-attr="attr:key,attr:key" - sets attributes (title, aria-label, placeholder, ...)
	 *   data-i18n-html-title       - shorthand: sets <title> on the element (used for <title> tag)
	 */
	function applyDomTranslations(root) {
		const scope = root || document;

		const textNodes = scope.querySelectorAll('[data-i18n]');
		textNodes.forEach((node) => {
			const key = node.getAttribute('data-i18n');
			if (!key) return;
			node.textContent = t(key);
		});

		const attrNodes = scope.querySelectorAll('[data-i18n-attr]');
		attrNodes.forEach((node) => {
			const spec = node.getAttribute('data-i18n-attr');
			if (!spec) return;
			spec.split(',').forEach((pair) => {
				const [attr, key] = pair.split(':').map((s) => s && s.trim());
				if (!attr || !key) return;
				node.setAttribute(attr, t(key));
			});
		});
	}

	// Initialize from the browser language list.
	setLocale(getNavigatorLanguages());

	window.CanvasNotes = window.CanvasNotes || {};
	window.CanvasNotes.I18n = {
		setLocale,
		getLocales,
		t,
		applyDomTranslations,
		strings,
	};
	window.CanvasNotes.t = t;

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => applyDomTranslations(), { once: true });
	} else {
		applyDomTranslations();
	}
})();
