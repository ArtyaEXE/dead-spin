import {loadGameTextures} from './assets';
import {loadDecoTexture} from './decorations-cache';
import {audio} from './audio';
import {getAllComicImages} from '../ui/comics';

/**
 * Полный прелоадинг контента — запускается один раз после авторизации,
 * до показа MainMenu. После этого все переходы между экранами происходят
 * мгновенно: Pixi-текстуры уже в Assets-кэше, аудио — в bufferCache,
 * DOM-картинки и CSS-фоны — в HTTP-кэше браузера.
 */

const UI_IMAGES = [
	'/global-bg.svg',
	'/main-menu-bg.svg',
	'/star.svg',
	'/booster-single.svg',
	// Skins (скины ракеты — превьюшки в Shop + игровая ship-текстура)
	'/ship-skins/ship-wanderer.svg',
	'/ship-skins/ship-engineer.svg',
	'/ship-skins/ship-veteran.svg',
	'/ship-skins/ship-asteroid-king.svg',
	'/cave/ceres-outer.svg',
	'/cave/ceres-inner.svg',
	'/cave/pallas-outer.svg',
	'/cave/pallas-inner.svg',
	'/cave/juno-outer.svg',
	'/cave/juno-inner.svg',
	'/cave/vesta-outer.svg',
	'/cave/vesta-inner.svg',
	'/cave/eunomia-outer.svg',
	'/cave/eunomia-inner.svg',
	// Machinarium-иконки: tutorial + level decorations (stop/gravity) + misc UI
	'/icons/icon-tap.svg',
	'/icons/icon-boost.svg',
	'/icons/icon-mine-warning.svg',
	'/icons/icon-stone-warning.svg',
	'/icons/icon-worm-warning.svg',
	'/icons/icon-finish.svg',
	'/icons/icon-star-collect.svg',
	'/icons/icon-loading.svg',
	'/icons/deco-stop.svg',
	'/icons/deco-gravity-down.svg', // одна текстура; renderer крутит её по углу гравитации
	// Batch 1 — UI-иконки в текстах/панелях (заменили FA).
	'/icons/fuel-icon.svg',
	'/icons/coins-icon.svg',
	'/icons/clock-icon.svg',
	'/icons/trophy-icon.svg',
	'/icons/lock-icon.svg',
	'/icons/warning-icon.svg',
	'/icons/daily-gift-icon.svg',
	// Batch 3 — Settings / ResultScreen / ghost.
	'/icons/music-icon.svg',
	'/icons/sound-icon.svg',
	'/icons/crash-icon.svg',
	'/icons/pause-icon.svg',
	'/icons/ghost-icon.svg',
	// 10 ачивок — рендерятся в overlay при первом тапе на trophy. Без
	// preload'а первое открытие показывало пустые карточки на ~300мс.
	'/icons/ach-first-clear.svg',
	'/icons/ach-first-3stars.svg',
	'/icons/ach-all-levels.svg',
	'/icons/ach-all-3stars.svg',
	'/icons/ach-speedrunner.svg',
	'/icons/ach-fuel-efficient.svg',
	'/icons/ach-all-skins.svg',
];

const DECO_NAMES = [
	// Legacy (shared / JUNO)
	...Array.from({length: 13}, (_, i) => `debris-${i + 1}.svg`),
	'gear-1.svg',
	'gear-2.svg',
	'pipe-1.svg',
	'pipe-2.svg',
	'pipe-3.svg',
	'pipe-4.svg',
	'robot-1.svg',
	'robot-2.svg',
	'robot-3.svg',
	'ship-1.svg',
	'ship-2.svg',
	'ship-3.svg',
	'ship-4.svg',
	'sign-danger.svg',
	'sign-down.svg',
	'sign-happy.svg',
	'sign-left.svg',
	'sign-right.svg',
	'sign-round.svg',
	'sign-sad.svg',
	'sign-warning.svg',
	'stuff-1.svg',
	'stuff-2.svg',
	'stuff-3.svg',
	'stuff-4.svg',
	// CERES
	'ceres/ceres-stalactite.svg',
	'ceres/ceres-crystal-cluster.svg',
	'ceres/ceres-frozen-probe.svg',
	'ceres/ceres-ice-sheet.svg',
	'ceres/ceres-frost-pipe.svg',
	'ceres/ceres-icicles.svg',
];

function preloadImage(url: string): Promise<void> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve();
		img.onerror = () => resolve();
		img.src = url;
	});
}

let preloadPromise: Promise<void> | null = null;

export function preloadAll(onProgress?: (done: number, total: number) => void): Promise<void> {
	if (preloadPromise) return preloadPromise;

	const tasks: Promise<unknown>[] = [];

	for (const url of UI_IMAGES) tasks.push(preloadImage(url));
	for (const url of getAllComicImages()) tasks.push(preloadImage(url));
	tasks.push(loadGameTextures());
	for (const name of DECO_NAMES) tasks.push(loadDecoTexture(name));
	tasks.push(audio.prewarm());

	const total = tasks.length;
	let done = 0;
	const step = (): void => {
		done++;
		onProgress?.(done, total);
	};

	const wrapped = tasks.map((p) => p.then(step, step));
	preloadPromise = Promise.all(wrapped).then(() => undefined);
	return preloadPromise;
}
