import {ru} from './ru';
import {en} from './en';

export type Locale = 'ru' | 'en';
export type Dict = typeof ru;

const DICTS: Record<Locale, Dict> = {ru, en};

export function t(locale: string | null | undefined): Dict {
	const loc = locale === 'ru' ? 'ru' : 'en';
	return DICTS[loc];
}

export function toLocale(s: string | null | undefined): Locale {
	return s === 'ru' ? 'ru' : 'en';
}
