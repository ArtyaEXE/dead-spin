/**
 * Тихие часы для DM-нотификаций. Окно задаётся строкой "HH-HH" в UTC.
 * Поддерживаем ночное окно через полночь (start > end → in-window если
 * hour >= start ИЛИ hour < end).
 *
 * Пример: "22-7" — тихо с 22:00 UTC до 07:00 UTC.
 */
export function parseQuietHours(spec: string): {start: number; end: number} {
	const m = spec.match(/^(\d{1,2})-(\d{1,2})$/);
	if (!m) throw new Error(`Invalid quiet-hours spec: ${spec}`);
	const start = Number(m[1]);
	const end = Number(m[2]);
	if (start < 0 || start > 23 || end < 0 || end > 23) {
		throw new Error(`Quiet-hours hours out of range: ${spec}`);
	}
	return {start, end};
}


export function isQuietHourUTC(date: Date, spec: string): boolean {
	const {start, end} = parseQuietHours(spec);
	if (start === end) return false; // 0-длина окна = всегда шумно
	const h = date.getUTCHours();
	return start < end
		? h >= start && h < end
		: h >= start || h < end;
}
