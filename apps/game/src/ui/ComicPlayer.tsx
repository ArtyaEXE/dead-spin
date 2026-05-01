import {createSignal, onCleanup, onMount, Show} from 'solid-js';
import type {Anchor, Caption, Comic, Panel, SoundCue} from '@dead-spin/shared';
import {audio} from '../game/audio';


/**
 * Универсальный плеер комиксов: проигрывает декларативный Comic
 * (apps/game/src/ui/comics/*.json) — панели с длительностью, шейком или
 * Ken Burns (pan + zoom через Web Animations API), звуковыми cue
 * (one-shot/loop с задержкой), субтитрами с typewriter-эффектом и
 * letterbox-полосами.
 *
 * Все таймеры/анимации/loop-ручки регистрируются как Cleanup +
 * (опционально) Pausable. Cleanup вызывается на смену панели, skip и
 * unmount — ничего не "залипает" в фоне. Pausable вызывается на
 * `visibilitychange` — когда вкладка свёрнута, panels не проматываются
 * вслепую и typewriter не убегает.
 *
 * На время проигрывания комикса игровая музыка приглушается через
 * audio.pauseMusic(); восстанавливается на unmount.
 */


type Cleanup = () => void;
type Pausable = {pause: () => void; resume: () => void};


const ANCHOR_TO_POSITION: Record<Anchor, string> = {
	center: '50% 50%',
	tl: '0% 0%',
	tr: '100% 0%',
	bl: '0% 100%',
	br: '100% 100%',
	top: '50% 0%',
	bottom: '50% 100%',
	left: '0% 50%',
	right: '100% 50%',
};


const FADE_MS = 600;


export function ComicPlayer(props: {comic: Comic; onFinish: () => void}) {
	const [idx, setIdx] = createSignal(0);
	const [captionText, setCaptionText] = createSignal('');
	const [fading, setFading] = createSignal(false);
	const imgRefs: HTMLImageElement[] = [];
	let panelCleanups: Cleanup[] = [];
	let panelPausables: Pausable[] = [];
	let transitioning = false;

	function runPanelCleanups(): void {
		for (const c of panelCleanups) c();
		panelCleanups = [];
		panelPausables = [];
	}

	function pauseAll(): void { for (const p of panelPausables) p.pause(); }
	function resumeAll(): void { for (const p of panelPausables) p.resume(); }

	/**
	 * Pausable setTimeout — корректно сохраняет остаток на pause()/resume().
	 * Регистрирует себя в panelCleanups и panelPausables.
	 */
	function addPausableTimeout(cb: () => void, ms: number): void {
		let id: number | null = null;
		let startedAt = 0;
		let remaining = ms;
		const start = (): void => {
			startedAt = Date.now();
			id = window.setTimeout(() => { id = null; cb(); }, remaining);
		};
		start();
		panelCleanups.push(() => { if (id !== null) { clearTimeout(id); id = null; } });
		panelPausables.push({
			pause: () => {
				if (id === null) return;
				clearTimeout(id);
				remaining = Math.max(0, remaining - (Date.now() - startedAt));
				id = null;
			},
			resume: () => {
				if (id !== null || remaining <= 0) return;
				start();
			},
		});
	}

	/**
	 * Pausable setInterval — на pause() гасит, на resume() стартует заново.
	 * Возвращает stop() — чтобы cb могла самозавершиться (typewriter после
	 * последнего символа).
	 */
	function addPausableInterval(cb: () => void, ms: number): {stop: () => void} {
		let id: number | null = null;
		const start = (): void => { id = window.setInterval(cb, ms); };
		const stop = (): void => { if (id !== null) { clearInterval(id); id = null; } };
		start();
		panelCleanups.push(stop);
		panelPausables.push({
			pause: stop,
			resume: () => { if (id === null) start(); },
		});
		return {stop};
	}

	function playCue(cue: SoundCue): void {
		const start = (): void => {
			if (cue.loop) {
				const h = audio.loop(cue.sound);
				if (!h) return;
				if (typeof cue.volume === 'number') h.setVolume(cue.volume);
				panelCleanups.push(() => h.stop());
			} else {
				audio.play(cue.sound, cue.volume);
			}
		};
		if (cue.delay && cue.delay > 0) addPausableTimeout(start, cue.delay);
		else start();
	}

	function scheduleCaption(c: Caption, panelDuration: number): void {
		const showStart = (): void => {
			if (!c.typewriter) {
				setCaptionText(c.text);
				return;
			}
			let i = 0;
			setCaptionText('');
			const stepMs = Math.max(10, 1000 / c.cps);
			let handle: {stop: () => void} | null = null;
			const tick = (): void => {
				i++;
				setCaptionText(c.text.slice(0, i));
				if (i >= c.text.length) handle?.stop();
			};
			handle = addPausableInterval(tick, stepMs);
		};

		if (c.at > 0) addPausableTimeout(showStart, c.at);
		else showStart();

		const hideAt = c.until ?? panelDuration;
		if (hideAt > c.at) addPausableTimeout(() => setCaptionText(''), hideAt);
	}

	function startKen(i: number, panel: Panel): void {
		const el = imgRefs[i];
		const k = panel.ken;
		if (!el || !k) return;
		for (const a of el.getAnimations()) a.cancel();
		// `easing` на самом keyframe задаёт easing СЕГМЕНТА от него до следующего.
		// За счёт ease-in-out на каждом узле скорость на якоре падает до нуля и
		// плавно набирается к следующему — это устраняет резкий "отскок" на
		// reverse-точках пути типа [left, right, center].
		const keyframes = k.path.map((anchor, j) => ({
			objectPosition: ANCHOR_TO_POSITION[anchor],
			transform: `scale(${k.scale})`,
			easing: j < k.path.length - 1 ? 'ease-in-out' : undefined,
		}));
		const duration = k.duration ?? panel.duration;
		const anim = el.animate(keyframes, {duration, fill: 'forwards'});
		panelCleanups.push(() => anim.cancel());
		panelPausables.push({pause: () => anim.pause(), resume: () => { void anim.play(); }});
	}

	function enterPanel(i: number): void {
		runPanelCleanups();
		setCaptionText('');
		const panel = props.comic.panels[i];
		if (!panel) return;
		for (const cue of panel.enter) playCue(cue);
		if (panel.caption) scheduleCaption(panel.caption, panel.duration);
		if (panel.ken) startKen(i, panel);
		addPausableTimeout(advance, panel.duration);
	}

	/**
	 * Любая смена панели/выход проходит через fade-to-black: текущая панель
	 * сначала плавно гаснет до 0 (открывая чёрный фон .comic-root), потом
	 * выполняется action — swap idx или onFinish. Старая Ken Burns анимация
	 * естественно "доигрывает в чёрный". Двойные клики во время fade
	 * игнорируются через флаг `transitioning`.
	 */
	function transitionTo(action: () => void): void {
		if (transitioning) return;
		transitioning = true;
		setFading(true);
		addPausableTimeout(() => {
			transitioning = false;
			setFading(false);
			action();
		}, FADE_MS);
	}

	function advance(): void {
		const next = idx() + 1;
		if (next >= props.comic.panels.length) {
			transitionTo(() => {
				runPanelCleanups();
				setCaptionText('');
				props.onFinish();
			});
			return;
		}
		transitionTo(() => {
			setIdx(next);
			enterPanel(next);
		});
	}

	function finishNow(): void {
		transitionTo(() => {
			runPanelCleanups();
			setCaptionText('');
			props.onFinish();
		});
	}

	const onVisibility = (): void => {
		if (document.hidden) pauseAll();
		else resumeAll();
	};

	onMount(() => {
		audio.pauseMusic();
		enterPanel(0);
		document.addEventListener('visibilitychange', onVisibility);
	});

	onCleanup(() => {
		document.removeEventListener('visibilitychange', onVisibility);
		runPanelCleanups();
		audio.resumeMusic();
	});

	return (
		<div class="comic-root" classList={{fading: fading()}}>
			{props.comic.panels.map((p, i) => (
				<img
					ref={el => { imgRefs[i] = el; }}
					src={p.img}
					class="comic-panel"
					classList={{
						[`shake-${p.shake}`]: p.shake !== 'none' && !p.ken,
						active: idx() === i,
					}}
				/>
			))}

			{props.comic.letterbox && (
				<>
					<div class="comic-letterbox-top" />
					<div class="comic-letterbox-bottom" />
				</>
			)}

			<Show when={captionText()}>
				<div class="comic-caption">{captionText()}</div>
			</Show>

			<button class="comic-skip-all pressable" onClick={finishNow} aria-label="Skip">
				<img src="/btn-close.png" alt="Skip" />
			</button>

			<button class="comic-skip pressable" onClick={advance} aria-label="Next">
				<img src="/btn-right.png" alt="Next" />
			</button>
		</div>
	);
}
