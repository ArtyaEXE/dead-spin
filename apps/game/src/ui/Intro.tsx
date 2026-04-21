import {createSignal, onCleanup, onMount} from 'solid-js';
import {audio, type LoopHandle} from '../game/audio';


/**
 * Intro-комикс перед первым уровнем: 3 слайда (c1-1..3.jpg) с "шейком" и
 * auto-advance через 7 секунд; кнопка > — проскочить.
 * Аудио-дорожки 1:1 с [Intro.svelte](space/imports/ui/comics/intro/Intro.svelte).
 */
const SLIDE_DURATION = 7000;
const SLIDES = [
	{img: '/comics/c1-1.jpg', shake: 'shake-slow'},
	{img: '/comics/c1-2.jpg', shake: 'shake-fast'},
	{img: '/comics/c1-3.jpg', shake: 'shake-medium'},
] as const;


export function Intro(props: {onFinish: () => void}) {
	const [slide, setSlide] = createSignal(0);
	let autoAdvance: number | null = null;
	let alarmTimeout: number | null = null;
	let alarmHandle: LoopHandle | null = null;

	function stopAlarm(): void {
		if (alarmTimeout !== null) { clearTimeout(alarmTimeout); alarmTimeout = null; }
		if (alarmHandle) { alarmHandle.stop(); alarmHandle = null; }
	}

	function enterSlide(idx: number): void {
		stopAlarm();
		if (idx === 0) {
			audio.play('rocket2');
		} else if (idx === 1) {
			audio.play('explosion1', 0.4);
			alarmTimeout = window.setTimeout(() => {
				if (slide() !== 1) return;
				alarmHandle = audio.loop('ship-alarm');
				alarmHandle?.setVolume(0.5);
			}, 2000);
		} else {
			alarmHandle = audio.loop('ship-alarm');
			alarmHandle?.setVolume(0.2);
		}
	}

	function advance(): void {
		const next = slide() + 1;
		if (next >= SLIDES.length) {
			stopAlarm();
			props.onFinish();
			return;
		}
		setSlide(next);
		enterSlide(next);
	}

	onMount(() => {
		enterSlide(0);
		const schedule = (): void => {
			autoAdvance = window.setTimeout(() => {
				advance();
				schedule();
			}, SLIDE_DURATION);
		};
		schedule();
	});

	onCleanup(() => {
		if (autoAdvance !== null) clearTimeout(autoAdvance);
		stopAlarm();
	});

	return (
		<div class="intro-root">
			{SLIDES.map((s, i) => (
				<img
					src={s.img}
					class="intro-slide"
					classList={{[s.shake]: true, active: slide() === i}}
				/>
			))}

			<button
				class="intro-skip pressable"
				onClick={() => {
					if (autoAdvance !== null) { clearTimeout(autoAdvance); autoAdvance = null; }
					advance();
					autoAdvance = window.setTimeout(() => advance(), SLIDE_DURATION);
				}}
			>
				<img src="/btn-right.png" alt="Next" />
			</button>
		</div>
	);
}
