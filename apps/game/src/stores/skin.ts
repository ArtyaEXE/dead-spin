import {api} from '../net/client';
import {authStore} from './auth';


export type SkinId = 'prospector' | 'wanderer' | 'engineer' | 'veteran' | 'asteroid-king';


export type SkinDef = {
	id: SkinId;
	src: string;
	name: string;
	requiredStars: number;
	/** Точка крепления бустера относительно центра спрайта (0,0). */
	nozzle: {x: number; y: number};
};


export const SKINS: readonly SkinDef[] = [
	{id: 'prospector',    src: '/ship2.png',                          name: 'PROSPECTOR',    requiredStars: 0,  nozzle: {x: -2, y: 40}},
	{id: 'wanderer',      src: '/ship-skins/ship-wanderer.png',       name: 'WANDERER',      requiredStars: 8,  nozzle: {x: -1, y: 38}},
	{id: 'engineer',      src: '/ship-skins/ship-engineer.png',       name: 'ENGINEER',      requiredStars: 20, nozzle: {x: 0,  y: 36}},
	{id: 'veteran',       src: '/ship-skins/ship-veteran.png',        name: 'VETERAN',       requiredStars: 35, nozzle: {x: 0,  y: 36}},
	{id: 'asteroid-king', src: '/ship-skins/ship-asteroid-king.png',  name: 'ASTEROID KING', requiredStars: 45, nozzle: {x: 0,  y: 35}},
] as const;


const LEGACY_SKIN_KEY = 'dead-spin.skin';
try { localStorage.removeItem(LEGACY_SKIN_KEY); } catch {/* noop */}


/**
 * Выбранный скин — всегда из `authStore.user.selectedSkin`.
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
