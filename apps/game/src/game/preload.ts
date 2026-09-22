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
	'/dead-spin-logo-shadow.png',
	'/dead-spin-logo.png',
	'/global-bg.jpg',
	'/main-menu-bg.png',
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
	'/icons/icon-tap.png',
	'/icons/icon-boost.png',
	'/icons/icon-mine-warning.png',
	'/icons/icon-stone-warning.png',
	'/icons/icon-worm-warning.png',
	'/icons/icon-finish.png',
	'/icons/icon-star-collect.png',
	'/icons/icon-loading.png',
	'/icons/deco-stop.png',
	'/icons/deco-gravity-down.png', // одна текстура; renderer крутит её по углу гравитации
	// Batch 1 — UI-иконки в текстах/панелях (заменили FA).
	'/icons/fuel-icon.png',
	'/icons/coins-icon.png',
	'/icons/clock-icon.png',
	'/icons/trophy-icon.png',
	'/icons/lock-icon.png',
	'/icons/warning-icon.png',
	'/icons/daily-gift-icon.png',
	// Batch 3 — Settings / ResultScreen / ghost.
	'/icons/music-icon.png',
	'/icons/sound-icon.png',
	'/icons/crash-icon.png',
	'/icons/pause-icon.png',
	'/icons/ghost-icon.png',
	// 10 ачивок — рендерятся в overlay при первом тапе на trophy. Без
	// preload'а первое открытие показывало пустые карточки на ~300мс.
	'/icons/ach-first-clear.png',
	'/icons/ach-first-3stars.png',
	'/icons/ach-all-levels.png',
	'/icons/ach-all-3stars.png',
	'/icons/ach-speedrunner.png',
	'/icons/ach-fuel-efficient.png',
	'/icons/ach-all-skins.png',
];

const DECO_NAMES = [
	// Legacy (shared / JUNO)
	...Array.from({length: 13}, (_, i) => `debris-${i + 1}.png`),
	'gear-1.png',
	'gear-2.png',
	'pipe-1.png',
	'pipe-2.png',
	'pipe-3.png',
	'pipe-4.png',
	'robot-1.png',
	'robot-2.png',
	'robot-3.png',
	'ship-1.png',
	'ship-2.png',
	'ship-3.png',
	'ship-4.png',
	'sign-danger.png',
	'sign-down.png',
	'sign-happy.png',
	'sign-left.png',
	'sign-right.png',
	'sign-round.png',
	'sign-sad.png',
	'sign-warning.png',
	'stuff-1.png',
	'stuff-2.png',
	'stuff-3.png',
	'stuff-4.png',
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
