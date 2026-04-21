import {worldLabel} from '../game/worlds';


/**
 * Нижний "dashboard-big" бар: имя мира/уровня, пауза, зум ±, и кнопка буста.
 *
 * Буст реагирует на pointerdown (покрывает и touchstart, и mousedown),
 * чтобы удерживание гарантированно давало импульс — 1-в-1 с оригиналом
 * (Game.svelte handleThrustBtn, mousedown/touchstart).
 */
export function BottomBar(props: {
	levelNumber: number;
	onPause: () => void;
	onZoomOut: () => void;
	onZoomIn: () => void;
	onBoost: () => void;
}) {
	const onBoostDown = (e: Event) => {
		e.preventDefault();
		props.onBoost();
	};

	return (
		<div class="bottombar">
			<div class="bottombar-left">
				<div class="panel">{worldLabel(props.levelNumber)}</div>

				<div class="bottombar-ctrl">
					<img src="/btn-pause.png" alt="Pause" onClick={props.onPause} />
					<img src="/btn-minus.png" alt="Zoom out" onClick={props.onZoomOut} />
					<img src="/btn-plus.png" alt="Zoom in" onClick={props.onZoomIn} />
				</div>
			</div>

			<img
				class="bottombar-boost"
				src="/btn-booster.png"
				alt="Boost"
				onPointerDown={onBoostDown}
			/>
		</div>
	);
}
