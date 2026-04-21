import {createEffect, onMount} from 'solid-js';
import {audio} from '../game/audio';


/**
 * Монтируется в authed-состоянии. Инициализирует AudioContext и gain-ноды
 * + подписки на Settings-store. Музыка стартует после того, как пользователь
 * нажал Play в MainMenu (prop `play=true`) — 1:1 с оригинальным
 * runMusicPlayer-флагом.
 */
export function MusicPlayer(props: {play: boolean}) {
	onMount(() => audio.init());

	createEffect(() => {
		if (props.play) audio.playMusic();
	});

	return null;
}
