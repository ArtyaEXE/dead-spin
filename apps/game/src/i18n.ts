import {createSignal} from 'solid-js';
import {z} from 'zod';
import {loadJson, saveJson} from './lib/persist';

/**
 * Локализация интерфейса игры. Строк немного намеренно — игра общается
 * иконками (GDD §15: «атмосфера ставится цветом и звуком, не текстом»).
 * Язык — предпочтение устройства: авто по navigator.language, переключается
 * в настройках, хранится локально.
 *
 * Названия ачивок лежат в `@dead-spin/shared` (ru/en) и берутся оттуда.
 */

export type Locale = 'ru' | 'en';
export const LOCALES: readonly Locale[] = ['ru', 'en'];

const KEY = 'dead-spin.locale';
const LocaleSchema = z.enum(['ru', 'en']);

function detect(): Locale {
	const lang = typeof navigator !== 'undefined' ? navigator.language : 'en';
	return lang.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

const [locale, setLocaleSignal] = createSignal<Locale>(loadJson(KEY, LocaleSchema, detect));

/** Реактивный (Solid) текущий язык. */
export const getLocale = locale;

export function setLocale(l: Locale): void {
	setLocaleSignal(l);
	saveJson(KEY, l);
}

const DICT = {
	en: {
		'achievements.title': 'Achievements',
		'daily.claim': 'Claim bonus: +{n} {coins}',
		'daily.day': 'day {n}',
		'daily.claimed': '+{n} {coins}',
		'rating.finish': 'finish',
		'rating.time': 'time',
		'rating.fullClear': '{c}/3 and fuel',
		'settings.title': 'SETTINGS',
		'settings.sound': 'SOUND',
		'settings.music': 'Music',
		'settings.effects': 'Effects',
		'settings.language': 'LANGUAGE',
		'settings.privacy': 'Privacy',
		'settings.build': 'build',
		'coins.one': 'coin',
		'coins.other': 'coins',
		'a11y.play': 'Play',
		'a11y.resume': 'Resume',
		'a11y.retry': 'Retry',
		'a11y.exit': 'Exit',
		'a11y.back': 'Back',
		'a11y.close': 'Close',
		'a11y.next': 'Next',
		'a11y.prevWorld': 'Previous world',
		'a11y.nextWorld': 'Next world',
		'a11y.settings': 'Settings',
		'a11y.shop': 'Ships',
		'a11y.achievements': 'Achievements',
		'a11y.pause': 'Pause',
		'a11y.zoomIn': 'Zoom in',
		'a11y.zoomOut': 'Zoom out',
		'a11y.boost': 'Thrust',
		'a11y.skip': 'Skip',
		'daily.challenge': 'Daily challenge',
		'daily.notPlayed': 'Not cleared today',
		'daily.yourBest': 'Your best: {t}',
		'daily.newBest': 'New best!',
		'daily.streak': '{n} days in a row',
		'daily.cleared': 'CLEARED',
		'daily.failed': 'CRASHED',
	},
	ru: {
		'achievements.title': 'Достижения',
		'daily.claim': 'Забрать бонус: +{n} {coins}',
		'daily.day': 'день {n}',
		'daily.claimed': '+{n} {coins}',
		'rating.finish': 'финиш',
		'rating.time': 'время',
		'rating.fullClear': '{c}/3 и топливо',
		'settings.title': 'НАСТРОЙКИ',
		'settings.sound': 'ЗВУК',
		'settings.music': 'Музыка',
		'settings.effects': 'Эффекты',
		'settings.language': 'ЯЗЫК',
		'settings.privacy': 'Конфиденциальность',
		'settings.build': 'сборка',
		'coins.one': 'монета',
		'coins.few': 'монеты',
		'coins.other': 'монет',
		'a11y.play': 'Играть',
		'a11y.resume': 'Продолжить',
		'a11y.retry': 'Заново',
		'a11y.exit': 'Выйти',
		'a11y.back': 'Назад',
		'a11y.close': 'Закрыть',
		'a11y.next': 'Дальше',
		'a11y.prevWorld': 'Предыдущий мир',
		'a11y.nextWorld': 'Следующий мир',
		'a11y.settings': 'Настройки',
		'a11y.shop': 'Корабли',
		'a11y.achievements': 'Достижения',
		'a11y.pause': 'Пауза',
		'a11y.zoomIn': 'Приблизить',
		'a11y.zoomOut': 'Отдалить',
		'a11y.boost': 'Тяга',
		'a11y.skip': 'Пропустить',
		'daily.challenge': 'Испытание дня',
		'daily.notPlayed': 'Сегодня не пройдено',
		'daily.yourBest': 'Лучшее: {t}',
		'daily.newBest': 'Новый рекорд!',
		'daily.streak': '{n} дней подряд',
		'daily.cleared': 'ПРОЙДЕНО',
		'daily.failed': 'РАЗБИЛСЯ',
	},
} as const;

export type MsgKey = keyof typeof DICT.en;

/** Форма множественного числа: ru — one/few/other, en — one/other. */
function pluralForm(l: Locale, n: number): 'one' | 'few' | 'other' {
	const abs = Math.abs(n);
	if (l === 'ru') {
		const m10 = abs % 10,
			m100 = abs % 100;
		if (m10 === 1 && m100 !== 11) return 'one';
		if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
		return 'other';
	}
	return abs === 1 ? 'one' : 'other';
}

/** Слово «монет» в нужной форме для числа n. */
export function coinsWord(n: number): string {
	const l = locale();
	const form = pluralForm(l, n);
	const d = DICT[l] as Record<string, string>;
	return d[`coins.${form}`] ?? d['coins.other'] ?? '';
}

/**
 * Строка по ключу с подстановкой {var}. `{coins}` подставляется как форма
 * слова «монет» для `n`, если `n` передан.
 */
export function t(key: MsgKey, vars: Record<string, string | number> = {}): string {
	const l = locale();
	const d = DICT[l] as Record<string, string>;
	let s = d[key] ?? DICT.en[key] ?? key;
	if (typeof vars['n'] === 'number' && s.includes('{coins}')) {
		s = s.replace('{coins}', coinsWord(vars['n']));
	}
	for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
	return s;
}
