import type {ZodType, ZodTypeDef} from 'zod';

/**
 * Единственная точка записи на устройство. Сейчас — localStorage: в
 * установленном приложении (Capacitor / WKWebView) он не подвержен
 * вытеснению по ITP, как в Safari. Когда понадобится Capacitor Preferences
 * или SQLite — меняется только этот файл.
 *
 * Всё под try/catch: в приватном режиме или при заблокированном хранилище
 * игра должна работать, просто без сохранения.
 */

// Input-тип схемы намеренно unknown: схемы с .default() имеют вход ≠ выход,
// и без этого TS не выводит T.
export function loadJson<T>(key: string, schema: ZodType<T, ZodTypeDef, unknown>, fallback: () => T): T {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return fallback();
		const parsed = schema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : fallback();
	} catch {
		return fallback();
	}
}

export function saveJson(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* нет места или хранилище недоступно — играем без сохранения */
	}
}

/** Местная дата YYYY-MM-DD — «новый день» в игре наступает по часам игрока. */
export function localDate(now: Date = new Date()): string {
	const p = (n: number): string => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
