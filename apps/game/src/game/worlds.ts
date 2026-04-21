const WORLD_NAMES = ['CERES', 'PALLAS', 'JUNO', 'VESTA', 'EUNOMIA'] as const;


/**
 * "CERES #3" — имя мира (15 уровней на мир) + номер уровня внутри мира.
 * В оригинале шапка уровня формируется так же: Game.svelte → "CERES #{levelNumber}".
 */
export function worldLabel(levelNumber: number): string {
	const worldIdx = Math.max(0, Math.min(WORLD_NAMES.length - 1, Math.floor((levelNumber - 1) / 15)));
	const inWorld = ((levelNumber - 1) % 15) + 1;
	return `${WORLD_NAMES[worldIdx]} #${inWorld}`;
}
