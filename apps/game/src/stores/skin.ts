import {api} from '../net/client';
import {authStore} from './auth';
import {groupStore} from './group';


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


/**
 * Выбранный скин — per-context. В group-контексте читаем
 * `groupStore.selectedSkin` (per-chat override); в DM — `authStore.user.selectedSkin`.
 *
 * Per-chat дефолт = prospector (если override не выставлен). DM-дефолт
 * тоже prospector. Никакого «наследования» DM → group: каждая беседа
 * со своим выбором независимо.
 */
export function getSelectedSkinId(): SkinId {
	const g = groupStore.getState();
	if (g.chatId !== null) {
		const raw = g.selectedSkin;
		if (raw && SKINS.some(s => s.id === raw)) return raw as SkinId;
		return 'prospector';
	}
	const u = authStore.getState().user;
	const raw = u?.selectedSkin;
	if (raw && SKINS.some(s => s.id === raw)) return raw as SkinId;
	return 'prospector';
}


/**
 * Сохранить выбор скина на сервере. В group-контексте сохраняется как
 * per-chat override (user_group_skins); в DM — `users.selected_skin`.
 * Реактивно обновляет соответствующий стор, чтобы UI перерисовался.
 */
export async function setSelectedSkinId(id: SkinId): Promise<void> {
	const res = await api.setSkin(id);
	if ('user' in res) {
		authStore.getState().setUser(res.user);
	} else {
		groupStore.getState().setSelectedSkin(res.groupSelectedSkin);
	}
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
