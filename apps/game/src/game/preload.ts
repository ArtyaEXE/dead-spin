import {loadGameTextures} from './assets';
import {loadDecoTexture} from './decorations-cache';
import {audio} from './audio';


/**
 * Полный прелоадинг контента — запускается один раз после авторизации,
 * до показа MainMenu. После этого все переходы между экранами происходят
 * мгновенно: Pixi-текстуры уже в Assets-кэше, аудио — в bufferCache,
 * DOM-картинки и CSS-фоны — в HTTP-кэше браузера.
 */


const UI_IMAGES = [
	'/btn-booster.png', '/btn-close.png', '/btn-cog.png', '/btn-left.png',
	'/btn-minus.png', '/btn-pause.png', '/btn-play.png', '/btn-plus.png',
	'/btn-replay.png', '/btn-right.png', '/btn-sound-off.png', '/btn-sound-on.png',
	'/btn-star.png',
	'/dead-spin-logo-shadow.png', '/dead-spin-logo.png',
	'/dashboard-big.png', '/dashboard-small.png',
	'/global-bg.png', '/main-menu-bg.png', '/result-screen-bg.png',
	'/screen-bold.png', '/screen-wide.png',
	'/star.png', '/booster-single.png',
	'/cave1.jpg', '/cave2.jpg', '/cave2-1.jpg', '/cave2-2.jpg',
	'/comics/c1-1.jpg', '/comics/c1-2.jpg', '/comics/c1-3.jpg',
];


const DECO_NAMES = [
	...Array.from({length: 13}, (_, i) => `debris-${i + 1}.png`),
	'gear-1.png', 'gear-2.png',
	'pipe-1.png', 'pipe-2.png', 'pipe-3.png', 'pipe-4.png',
	'robot-1.png', 'robot-2.png', 'robot-3.png',
	'ship-1.png', 'ship-2.png', 'ship-3.png', 'ship-4.png',
	'sign-danger.png', 'sign-down.png', 'sign-happy.png', 'sign-left.png',
	'sign-right.png', 'sign-round.png', 'sign-sad.png', 'sign-warning.png',
	'stuff-1.png', 'stuff-2.png', 'stuff-3.png', 'stuff-4.png',
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
	tasks.push(loadGameTextures());
	for (const name of DECO_NAMES) tasks.push(loadDecoTexture(name));
	tasks.push(audio.prewarm());

	const total = tasks.length;
	let done = 0;
	const step = (): void => {
		done++;
		onProgress?.(done, total);
	};

	const wrapped = tasks.map(p => p.then(step, step));
	preloadPromise = Promise.all(wrapped).then(() => undefined);
	return preloadPromise;
}
