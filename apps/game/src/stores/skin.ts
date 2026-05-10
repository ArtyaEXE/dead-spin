import {api} from '../net/client';
import {authStore} from './auth';


export type SkinId = 'prospector' | 'wanderer' | 'engineer' | 'veteran' | 'asteroid-king';


export type SkinDef = {
	id: SkinId;
	src: string;
	name: string;
	requiredStars: number;
};


/**
 * Скины ракеты, открываются по мере накопленных звёзд.
 * Цены подобраны под мир CERES (45★ максимум): 8 — ранний reward,
 * 20 — середина, 35 — почти-completion, 45 — perfect-trophy.
 */
export const SKINS: readonly SkinDef[] = [
	{id: 'prospector',    src: '/ship2.png',                          name: 'PROSPECTOR',    requiredStars: 0},
	{id: 'wanderer',      src: '/ship-skins/ship-wanderer.png',       name: 'WANDERER',      requiredStars: 8},
	{id: 'engineer',      src: '/ship-skins/ship-engineer.png',       name: 'ENGINEER',      requiredStars: 20},
	{id: 'veteran',       src: '/ship-skins/ship-veteran.png',        name: 'VETERAN',       requiredStars: 35},
	{id: 'asteroid-king', src: '/ship-skins/ship-asteroid-king.png',  name: 'ASTEROID KING', requiredStars: 45},
] as const;


// Старый ключ — чистим при первом запуске после миграции на БД, чтобы
// устаревшее значение в localStorage не путало юзера.
const LEGACY_SKIN_KEY = 'dead-spin.skin';
try { localStorage.removeItem(LEGACY_SKIN_KEY); } catch {/* noop */}


/** Выбранный скин из БД (через authStore.user.selectedSkin). */
export function getSelectedSkinId(): SkinId {
	const u = authStore.getState().user;
	const raw = u?.selectedSkin;
	if (raw && SKINS.some(s => s.id === raw)) return raw as SkinId;
	return 'prospector';
}


/**
 * Сохранить выбор скина на сервере. Возвращает promise — caller'у можно
 * подождать успеха и обновить UI, либо запустить и забыть. На успех в
 * authStore попадает свежий user, реактивные подписчики автоматом
 * перерисуют ракету.
 */
export async function setSelectedSkinId(id: SkinId): Promise<void> {
	const res = await api.setSkin(id);
	authStore.getState().setUser(res.user);
}


export function getSkinById(id: SkinId): SkinDef {
	return SKINS.find(s => s.id === id) ?? SKINS[0]!;
}


export function isSkinUnlocked(skin: SkinDef, summaryStars: number): boolean {
	return summaryStars >= skin.requiredStars;
}


/**
 * Активный скин — выбранный из БД с проверкой того, что он разблокирован
 * в **текущем** контексте. Скины зависят от прогресса:
 * в DM это глобальные звёзды, в группе — звёзды только этой беседы.
 *
 * Без этой проверки игрок, разблокировавший Wanderer в DM, открывая
 * Mini App в свежей беседе с 0★, играл бы Wanderer'ом — что неправильно
 * по правилам прогрессии в группе.
 */
export function getActiveSkinId(summaryStars: number): SkinId {
	const selected = getSelectedSkinId();
	const skin = getSkinById(selected);
	return isSkinUnlocked(skin, summaryStars) ? selected : 'prospector';
}
