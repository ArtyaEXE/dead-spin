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


const SKIN_KEY = 'dead-spin.skin';


export function getSelectedSkinId(): SkinId {
	try {
		const raw = localStorage.getItem(SKIN_KEY);
		if (raw && SKINS.some(s => s.id === raw)) return raw as SkinId;
	} catch {/* noop */}
	return 'prospector';
}


export function setSelectedSkinId(id: SkinId): void {
	try { localStorage.setItem(SKIN_KEY, id); } catch {/* noop */}
}


export function getSkinById(id: SkinId): SkinDef {
	return SKINS.find(s => s.id === id) ?? SKINS[0]!;
}


export function isSkinUnlocked(skin: SkinDef, summaryStars: number): boolean {
	return summaryStars >= skin.requiredStars;
}
