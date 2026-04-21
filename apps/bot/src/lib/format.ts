import {FUEL_MAX, LEVEL_COUNT} from '@dead-spin/shared';


/**
 * UI-хелперы для красивых HTML-сообщений бота.
 * Вся визуалка в одном файле — чтобы стиль не разъезжался между экранами.
 */


export const LINE = '━━━━━━━━━━━━━━━━━━━';
export const DOTS = '· · · · · · · · · · · ·';


export function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


/** "11 500" — пробел как разделитель тысяч (узкий NBSP). */
export function fmtNum(n: number): string {
	return n.toLocaleString('ru-RU').replace(/\u00A0/g, ' ');
}


/** "0:09.0" — время прохождения. */
export function fmtTime(ms: number): string {
	const totalSec = ms / 1000;
	const min = Math.floor(totalSec / 60);
	const sec = totalSec - min * 60;
	return `${min}:${sec.toFixed(1).padStart(4, '0')}`;
}


/** "███████░░░░░ 58%" — прогресс-бар символами. Длина фиксированная — 12. */
export function progressBar(current: number, max: number, len: number = 12): string {
	const ratio = Math.max(0, Math.min(1, current / max));
	const filled = Math.round(ratio * len);
	return '█'.repeat(filled) + '░'.repeat(len - filled);
}


/** Строка статистики с моноширинным значением. */
export function statRow(label: string, value: string | number): string {
	return `${label}  <code>${typeof value === 'number' ? fmtNum(value) : value}</code>`;
}


/** Центральная карточка статистики — единый визуал для профиля и главного меню. */
export function statsCard(params: {
	fuel: number;
	summaryStars: number;
	coins: number;
	levelsCleared: number;
}): string {
	const fuelBar = progressBar(params.fuel, FUEL_MAX);
	const maxStars = LEVEL_COUNT * 3;
	return [
		`⛽ <b>Fuel</b>   <code>${fmtNum(params.fuel)} / ${fmtNum(FUEL_MAX)}</code>`,
		`   <code>${fuelBar}</code>`,
		``,
		statRow('⭐ Stars  ', `${fmtNum(params.summaryStars)} / ${maxStars}`),
		statRow('💰 Coins  ', params.coins),
		statRow('🏁 Levels ', `${params.levelsCleared} / ${LEVEL_COUNT}`),
	].join('\n');
}


export function rankEmoji(rank: number): string {
	if (rank === 1) return '🥇';
	if (rank === 2) return '🥈';
	if (rank === 3) return '🥉';
	return ` ${rank}.`;
}


export function starsEmoji(stars: number): string {
	return '⭐'.repeat(stars) + '·'.repeat(3 - stars);
}


export function pluralize(n: number, one: string, few: string, many: string): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	if (mod10 === 1 && mod100 !== 11) return one;
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
	return many;
}
