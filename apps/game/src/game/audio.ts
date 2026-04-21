import {audioStore} from '../stores/audio';


/**
 * Аудио-движок: полный WebAudio API с кэшем декодированных AudioBuffer'ов.
 * Порт [audio.js](space/imports/lib/client/audio.js) из оригинала 1:1.
 *
 * Почему не Howler/HTML5 Audio — разные браузеры непоследовательно
 * работают с политикой autoplay для HTML5 Audio; WebAudio через
 * decodeAudioData даёт предсказуемый контроль и мгновенное воспроизведение
 * множественных SFX без glitch'ей.
 */


const SOUNDS: Record<string, string> = {
	'booster':      '/effects/gameplay/booster.mp3',
	'star-catch':   '/effects/gameplay/star-catch.mp3',
	'explosion1':   '/effects/explosion/explosion1.mp3',
	'explosion2':   '/effects/explosion/explosion2.mp3',
	'explosion3':   '/effects/explosion/explosion3.mp3',
	'rocket1':      '/effects/rocket/rocket1.mp3',
	'rocket2':      '/effects/rocket/rocket2.mp3',
	'stone-impact': '/enemies/stone/stone-impact.mp3',
	'worm':         '/enemies/worm/worm.mp3',
	'ship-alarm':   '/comics/ship-alarm.mp3',
};


const MUSIC: Record<number, {url: string; volume: number}> = {
	1: {url: '/music/music1.mp3', volume: 0.3},
	2: {url: '/music/music2.mp3', volume: 0.3},
	3: {url: '/music/music3.mp3', volume: 0.3},
	4: {url: '/music/music4.mp3', volume: 0.3},
	5: {url: '/music/music5.mp3', volume: 0.3},
	6: {url: '/music/music6.mp3', volume: 0.15},
	7: {url: '/music/music7.mp3', volume: 0.15},
	8: {url: '/music/music8.mp3', volume: 0.25},
	9: {url: '/music/music9.mp3', volume: 0.25},
};

const MUSIC_KEYS = Object.keys(MUSIC).map(Number);


export type LoopHandle = {
	setVolume: (v: number) => void;
	pause: () => void;
	resume: () => void;
	stop: () => void;
};


/// STATE ///

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;

const bufferCache = new Map<string, AudioBuffer>();

let currentMusicSource: AudioBufferSourceNode | null = null;
let currentMusicTrackGain: GainNode | null = null;
let currentMusicKey: number | null = null;
let musicPlaying = false;


/// BUFFER CACHE ///

async function getBuffer(url: string): Promise<AudioBuffer> {
	const cached = bufferCache.get(url);
	if (cached) return cached;
	if (!ctx) throw new Error('AudioContext not initialised');

	const response = await fetch(url);
	const arrayBuffer = await response.arrayBuffer();
	const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
	bufferCache.set(url, audioBuffer);
	return audioBuffer;
}


/// INIT ///

function init(): void {
	if (ctx) return;

	const Ctor: typeof AudioContext =
		window.AudioContext ?? (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
	ctx = new Ctor();

	masterGain = ctx.createGain();
	masterGain.connect(ctx.destination);

	musicGain = ctx.createGain();
	musicGain.connect(masterGain);

	sfxGain = ctx.createGain();
	sfxGain.connect(masterGain);

	// Первичная синхронизация с текущим state стора
	const s = audioStore.getState();
	masterGain.gain.value = s.masterVolume;
	musicGain.gain.value = s.musicVolume;
	sfxGain.gain.value = s.sfxEnabled ? s.sfxVolume : 0;

	// Подписка на изменения из Settings
	audioStore.subscribe((state, prev) => {
		if (!masterGain || !musicGain || !sfxGain) return;

		if (state.masterVolume !== prev.masterVolume) {
			masterGain.gain.value = state.masterVolume;
		}
		if (state.musicVolume !== prev.musicVolume) {
			musicGain.gain.value = state.musicVolume;
		}
		if (state.sfxVolume !== prev.sfxVolume || state.sfxEnabled !== prev.sfxEnabled) {
			sfxGain.gain.value = state.sfxEnabled ? state.sfxVolume : 0;
		}
		if (state.musicEnabled !== prev.musicEnabled) {
			if (!state.musicEnabled && musicPlaying) stopMusic();
			else if (state.musicEnabled && !musicPlaying) playMusic();
		}
	});

	// Resume AudioContext на первый user-gesture — политика autoplay браузера.
	const resumeOnGesture = (): void => {
		if (ctx && ctx.state === 'suspended') void ctx.resume();
	};
	document.addEventListener('touchstart', resumeOnGesture, {once: true});
	document.addEventListener('click', resumeOnGesture, {once: true});

	// Пауза при скрытой вкладке.
	document.addEventListener('visibilitychange', () => {
		if (!ctx) return;
		if (document.visibilityState === 'hidden') void ctx.suspend();
		else void ctx.resume();
	});
}


/// SFX: ONE-SHOT ///

function play(name: keyof typeof SOUNDS | string, volume?: number): void {
	if (!ctx || !sfxGain) return;
	const s = audioStore.getState();
	if (!s.sfxEnabled) return;
	if (ctx.state === 'suspended') void ctx.resume();

	const url = SOUNDS[name];
	if (!url) return;

	void getBuffer(url).then((buffer) => {
		if (!ctx || !sfxGain) return;
		const source = ctx.createBufferSource();
		source.buffer = buffer;

		if (typeof volume === 'number' && volume >= 0 && volume <= 1) {
			const gain = ctx.createGain();
			gain.gain.value = volume;
			source.connect(gain);
			gain.connect(sfxGain);
		} else {
			source.connect(sfxGain);
		}

		source.start(0);
	});
}


/// SFX: LOOP ///

function loop(name: keyof typeof SOUNDS | string): LoopHandle | null {
	if (!ctx || !sfxGain) return null;
	const url = SOUNDS[name];
	if (!url) return null;

	let source: AudioBufferSourceNode | null = null;
	const gainNode = ctx.createGain();
	gainNode.gain.value = 0;
	gainNode.connect(sfxGain);
	let stopped = false;
	let paused = false;

	void getBuffer(url).then((buffer) => {
		if (stopped || !ctx) return;
		source = ctx.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		source.connect(gainNode);
		source.start(0);
	});

	return {
		setVolume(v) {
			gainNode.gain.value = Math.max(0, Math.min(1, v));
		},
		pause() {
			if (!paused) {
				gainNode.disconnect();
				paused = true;
			}
		},
		resume() {
			if (paused && !stopped && sfxGain) {
				gainNode.connect(sfxGain);
				paused = false;
			}
		},
		stop() {
			stopped = true;
			if (source) {
				try { source.stop(); source.disconnect(); } catch { /* already stopped */ }
			}
			gainNode.disconnect();
			source = null;
		},
	};
}


/// MUSIC ///

function getRandomMusicKey(exclude: number | null): number {
	const filtered = exclude !== null ? MUSIC_KEYS.filter(k => k !== exclude) : MUSIC_KEYS;
	return filtered[Math.floor(Math.random() * filtered.length)]!;
}


async function playMusicTrack(key: number): Promise<void> {
	if (!ctx || !musicGain) return;

	if (currentMusicSource) {
		try {
			currentMusicSource.stop();
			currentMusicSource.disconnect();
		} catch { /* noop */ }
	}

	const track = MUSIC[key]!;
	const buffer = await getBuffer(track.url);
	if (!musicPlaying || !ctx || !musicGain) return;

	currentMusicKey = key;

	const source = ctx.createBufferSource();
	source.buffer = buffer;

	const trackGain = ctx.createGain();
	trackGain.gain.value = track.volume;
	source.connect(trackGain);
	trackGain.connect(musicGain);

	source.onended = () => {
		if (!musicPlaying) return;
		const nextKey = getRandomMusicKey(key);
		void playMusicTrack(nextKey);
	};

	source.start(0);
	currentMusicSource = source;
	currentMusicTrackGain = trackGain;
}


function playMusic(): void {
	if (!ctx) return;
	if (musicPlaying) return;
	const s = audioStore.getState();
	if (!s.musicEnabled) return;
	if (ctx.state === 'suspended') void ctx.resume();

	musicPlaying = true;
	const key = getRandomMusicKey(currentMusicKey);
	void playMusicTrack(key);
}


function stopMusic(): void {
	musicPlaying = false;
	if (currentMusicSource) {
		currentMusicSource.onended = null;
		try {
			currentMusicSource.stop();
			currentMusicSource.disconnect();
		} catch { /* noop */ }
		currentMusicSource = null;
	}
	currentMusicTrackGain = null;
	currentMusicKey = null;
}


function pauseMusic(): void {
	if (currentMusicTrackGain) currentMusicTrackGain.disconnect();
}


function resumeMusic(): void {
	if (currentMusicTrackGain && musicPlaying && musicGain) {
		currentMusicTrackGain.connect(musicGain);
	}
}


async function prewarm(): Promise<void> {
	if (!ctx) return;
	const urls = [
		...Object.values(SOUNDS),
		...Object.values(MUSIC).map(m => m.url),
	];
	await Promise.all(urls.map(url => getBuffer(url).catch(() => null)));
}


export const audio = {
	init,
	play,
	loop,
	playMusic,
	stopMusic,
	pauseMusic,
	resumeMusic,
	prewarm,
};
