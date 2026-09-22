import {SKIN_STAR_THRESHOLDS, type SkinId} from '@dead-spin/shared';
import {profileStore} from './profile';

export type {SkinId};

export type SkinDef = {
	id: SkinId;
	src: string;
	name: string;
	requiredStars: number;
	/** Точка крепления бустера относительно центра спрайта (0,0). */
	nozzle: {x: number; y: number};
};

// Пороги ★ — из shared (единый источник с ачивкой all_skins), здесь только визуал.
export const SKINS: readonly SkinDef[] = [
	{
		id: 'prospector',
		src: '/ship2.svg',
		name: 'PROSPECTOR',
		requiredStars: SKIN_STAR_THRESHOLDS['prospector'],
		nozzle: {x: -2, y: 40},
	},
	{
		id: 'wanderer',
		src: '/ship-skins/ship-wanderer.svg',
		name: 'WANDERER',
		requiredStars: SKIN_STAR_THRESHOLDS['wanderer'],
		nozzle: {x: -1, y: 38},
	},
	{
		id: 'engineer',
		src: '/ship-skins/ship-engineer.svg',
		name: 'ENGINEER',
		requiredStars: SKIN_STAR_THRESHOLDS['engineer'],
		nozzle: {x: 0, y: 36},
	},
	{
		id: 'veteran',
		src: '/ship-skins/ship-veteran.svg',
		name: 'VETERAN',
		requiredStars: SKIN_STAR_THRESHOLDS['veteran'],
		nozzle: {x: 0, y: 36},
	},
	{
		id: 'asteroid-king',
		src: '/ship-skins/ship-asteroid-king.svg',
		name: 'ASTEROID KING',
		requiredStars: SKIN_STAR_THRESHOLDS['asteroid-king'],
		nozzle: {x: 0, y: 35},
	},
] as const;

const LEGACY_SKIN_KEY = 'dead-spin.skin';
try {
	localStorage.removeItem(LEGACY_SKIN_KEY);
} catch {
	/* noop */
}

/** Выбранный скин — из профиля устройства. */
export function getSelectedSkinId(): SkinId {
	return profileStore.getState().profile.selectedSkin;
}

export function setSelectedSkinId(id: SkinId): void {
	profileStore.getState().setSkin(id);
}

export function getSkinById(id: SkinId): SkinDef {
	return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}

export function isSkinUnlocked(skin: SkinDef, summaryStars: number): boolean {
	return summaryStars >= skin.requiredStars;
}

/**
 * Активный скин — выбранный с проверкой, что он разблокирован по
 * summaryStars. Иначе prospector.
 */
export function getActiveSkinId(summaryStars: number): SkinId {
	const selected = getSelectedSkinId();
	const skin = getSkinById(selected);
	return isSkinUnlocked(skin, summaryStars) ? selected : 'prospector';
}
