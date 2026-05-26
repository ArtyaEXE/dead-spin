import {createSignal, onMount, onCleanup} from 'solid-js';
import type {PendingPush} from '../net/schemas';


/**
 * Overlay-компонент для auto-push в челлендж. Показывает карточку с
 * информацией о дуэли и обратный отсчёт 3 → 2 → 1 → GO, после чего
 * вызывает onGo(push) — caller'у переключать режим и стартовать уровень.
 *
 * Стилистика: result-screen-bg.png карточка, pop-in анимация,
 * Road Rage font. Countdown-числа крупные, пульсируют.
 */
export function ChallengePushOverlay(props: {
	push: PendingPush;
	onGo: (push: PendingPush) => void;
	onDismiss: () => void;
}) {
	const [count, setCount] = createSignal(3);

	onMount(() => {
		const id = window.setInterval(() => {
			setCount(c => {
				if (c <= 1) {
					clearInterval(id);
					props.onGo(props.push);
					return 0;
				}
				return c - 1;
			});
		}, 1000);
		onCleanup(() => clearInterval(id));
	});

	return (
		<div class="cpush-overlay" onClick={props.onDismiss}>
			<div class="cpush-card" onClick={(e) => e.stopPropagation()}>
				<img class="cpush-icon" src="/icons/challenge-icon.png" alt="" />
				<div class="cpush-title">ДУЭЛЬ</div>
				<div class="cpush-opponent">
					vs <b>{props.push.opponentUsername}</b>
				</div>
				<div class="cpush-level">
					уровень {props.push.level}
				</div>
				<div class="cpush-countdown" classList={{go: count() === 0}}>
					{count() > 0 ? count() : 'GO'}
				</div>
				<div class="cpush-chat">
					{props.push.chatTitle ?? ''}
				</div>
			</div>
		</div>
	);
}
