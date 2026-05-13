import {LevelSchema, type Level} from '@dead-spin/shared';

// CERES (мир 1) — L1-L15.
import l1 from './data/1.json' with {type: 'json'};
import l2 from './data/2.json' with {type: 'json'};
import l3 from './data/3.json' with {type: 'json'};
import l4 from './data/4.json' with {type: 'json'};
import l5 from './data/5.json' with {type: 'json'};
import l6 from './data/6.json' with {type: 'json'};
import l7 from './data/7.json' with {type: 'json'};
import l8 from './data/8.json' with {type: 'json'};
import l9 from './data/9.json' with {type: 'json'};
import l10 from './data/10.json' with {type: 'json'};
import l11 from './data/11.json' with {type: 'json'};
import l12 from './data/12.json' with {type: 'json'};
import l13 from './data/13.json' with {type: 'json'};
import l14 from './data/14.json' with {type: 'json'};
import l15 from './data/15.json' with {type: 'json'};

// PALLAS (мир 2) — L16-L30.
import l16 from './data/16.json' with {type: 'json'};
import l17 from './data/17.json' with {type: 'json'};
import l18 from './data/18.json' with {type: 'json'};
import l19 from './data/19.json' with {type: 'json'};
import l20 from './data/20.json' with {type: 'json'};
import l21 from './data/21.json' with {type: 'json'};
import l22 from './data/22.json' with {type: 'json'};
import l23 from './data/23.json' with {type: 'json'};
import l24 from './data/24.json' with {type: 'json'};
import l25 from './data/25.json' with {type: 'json'};
import l26 from './data/26.json' with {type: 'json'};
import l27 from './data/27.json' with {type: 'json'};
import l28 from './data/28.json' with {type: 'json'};
import l29 from './data/29.json' with {type: 'json'};
import l30 from './data/30.json' with {type: 'json'};


const raw = [
	l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15,
	l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30,
];


export const levels: readonly Level[] = raw.map((data, idx) => {
	const result = LevelSchema.safeParse(data);
	if (!result.success) {
		throw new Error(
			`Invalid level at index ${idx}: ${result.error.issues.map(i => i.path.join('.') + ' ' + i.message).join('; ')}`
		);
	}
	return result.data;
});


/**
 * Map number → level. Используем `level.name` (там лежит "1"/"16"/...)
 * как номер. Раньше getLevelByNumber полагался на index = number-1, что
 * ломалось бы с дыркой между CERES (1-3) и PALLAS (16-30).
 */
const byNumber = new Map<number, Level>();
for (const lvl of levels) {
	const n = Number(lvl.name);
	if (!Number.isInteger(n)) throw new Error(`Level name is not a number: "${lvl.name}"`);
	byNumber.set(n, lvl);
}


/** Sorted список существующих номеров уровней. UI использует для рендера. */
export const LEVEL_NUMBERS: readonly number[] =
	Array.from(byNumber.keys()).sort((a, b) => a - b);


export function getLevelByNumber(n: number): Level | undefined {
	return byNumber.get(n);
}


/**
 * Наибольший существующий уровень < n. Используется для gate'а
 * «можно играть N если предыдущий пройден» — теперь под «предыдущим»
 * понимаем ближайший существующий до N, а не N-1 (которого может не быть).
 * Возвращает null если N — первый из существующих.
 */
export function getPreviousLevelNumber(n: number): number | null {
	let best: number | null = null;
	for (const k of byNumber.keys()) {
		if (k < n && (best === null || k > best)) best = k;
	}
	return best;
}


/**
 * Наименьший существующий уровень > n. Используется UI-кнопкой «Next»
 * на ResultScreen — после L3 следующий не L4 (его нет), а L16 (PALLAS).
 * Возвращает null если n — последний из существующих.
 */
export function getNextLevelNumber(n: number): number | null {
	let best: number | null = null;
	for (const k of byNumber.keys()) {
		if (k > n && (best === null || k < best)) best = k;
	}
	return best;
}
