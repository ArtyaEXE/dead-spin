import {createStore} from 'zustand/vanilla';
import {createSolidStoreAdapter} from './solid';


/**
 * Persisted-stores настроек звука — аналог audio-store.js в оригинале.
 * Значения хранятся в localStorage под теми же ключами `ako_*`, что и в
 * оригинальном проекте (совместимость данных).
 */


type AudioState = {
	masterVolume: number;
	musicVolume: number;
	sfxVolume: number;
	musicEnabled: boolean;
	sfxEnabled: boolean;

	setMasterVolume: (v: number) => void;
	setMusicVolume: (v: number) => void;
	setSfxVolume: (v: number) => void;
	setMusicEnabled: (v: boolean) => void;
	setSfxEnabled: (v: boolean) => void;
};


function persistedNumber(key: string, def: number, min: number, max: number): number {
	try {
		const raw = JSON.parse(localStorage.getItem(key) ?? 'null');
		if (typeof raw === 'number' && raw >= min && raw <= max) return raw;
	} catch { /* noop */ }
	localStorage.setItem(key, JSON.stringify(def));
	return def;
}

function persistedBool(key: string, def: boolean): boolean {
	try {
		const raw = JSON.parse(localStorage.getItem(key) ?? 'null');
		if (typeof raw === 'boolean') return raw;
	} catch { /* noop */ }
	localStorage.setItem(key, JSON.stringify(def));
	return def;
}


export const audioStore = createStore<AudioState>((set) => ({
	masterVolume: persistedNumber('ako_masterVolume', 1, 0, 1),
	musicVolume: persistedNumber('ako_musicVolume', 1, 0, 1),
	sfxVolume: persistedNumber('ako_sfxVolume', 1, 0, 1),
	musicEnabled: persistedBool('ako_musicEnabled', true),
	sfxEnabled: persistedBool('ako_sfxEnabled', true),

	setMasterVolume(v) {
		const clamped = Math.max(0, Math.min(1, v));
		localStorage.setItem('ako_masterVolume', JSON.stringify(clamped));
		set({masterVolume: clamped});
	},
	setMusicVolume(v) {
		const clamped = Math.max(0, Math.min(1, v));
		localStorage.setItem('ako_musicVolume', JSON.stringify(clamped));
		set({musicVolume: clamped});
	},
	setSfxVolume(v) {
		const clamped = Math.max(0, Math.min(1, v));
		localStorage.setItem('ako_sfxVolume', JSON.stringify(clamped));
		set({sfxVolume: clamped});
	},
	setMusicEnabled(v) {
		localStorage.setItem('ako_musicEnabled', JSON.stringify(v));
		set({musicEnabled: v});
	},
	setSfxEnabled(v) {
		localStorage.setItem('ako_sfxEnabled', JSON.stringify(v));
		set({sfxEnabled: v});
	},
}));


export const useAudio = createSolidStoreAdapter(audioStore);
