import {api} from '../net/client';
import {authStore} from './auth';


export type SkinId = 'prospector' | 'wanderer' | 'engineer' | 'veteran' | 'asteroid-king';


export type SkinDef = {
	id: SkinId;
	src: string;
	name: string;
	requiredStars: number;
};


export const SKINS: readonly SkinDef[] = [
	{id: 'prospector',    src: '/ship2.png',                          name: 'PROSPECTOR',    requiredStars: 0},
	{id: 'wanderer',      src: '/ship-skins/ship-wanderer.png',       name: 'WANDERER',      requiredStars: 8},
	{id: 'engineer',      src: '/ship-skins/ship-engineer.png',       name: 'ENGINEER',      requiredStars: 20},
	{id: 'veteran',       src: '/ship-skins/ship-veteran.png',        name: 'VETERAN',       requiredStars: 35},
	{id: 'asteroid-king', src: '/ship-skins/ship-asteroid-king.png',  name: 'ASTEROID KING', requiredStars: 45},
] as const;


const LEGACY_SKIN_KEY = 'dead-spin.skin';
try { localStorage.removeItem(LEGACY_SKIN_KEY); } catch {/* noop */}


/**
 * Выбранный скин — глобальный. Всегда из `authStore.user.selectedSkin`.
 * Per-context overrides (user_group_skins) deprecated.
 */
export function getSelectedSkinId(): SkinId {
	const u = authStore.getState().user;
	const raw = u?.selectedSkin;
	if (raw && SKINS.some(s => s.id === raw)) return raw as SkinId;
	return 'prospector';
}


/**
 * Сохранить выбор скина на сервере — всегда в `users.selected_skin`.
 */
export async function setSelectedSkinId(id: SkinId): Promise<void> {
	const res = await api.setSkin(id);
	if ('user' in res) {
		authStore.getState().setUser(res.user);
	}
}


export function getSkinById(id: SkinId): SkinDef {
	return SKINS.find(s => s.id === id) ?? SKINS[0]!;
}


export function isSkinUnlocked(skin: SkinDef, summaryStars: number): boolean {
	return summaryStars >= skin.requiredStars;
}


/**
 * Активный скин — выбранный с проверкой что он разблокирован по
 * глобальным summaryStars. Скин один на аккаунт.
 */
export function getActiveSkinId(summaryStars: number): SkinId {
	const selected = getSelectedSkinId();
	const skin = getSkinById(selected);
	return isSkinUnlocked(skin, summaryStars) ? selected : 'prospector';
}
