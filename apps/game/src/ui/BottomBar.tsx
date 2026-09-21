import {worldLabel} from '../game/worlds';
import {t} from '../i18n';
import {RoundBtn} from './Icon';

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
					<RoundBtn icon="pause" label={t('a11y.pause')} size="sm" onClick={props.onPause} />
					<RoundBtn icon="minus" label={t('a11y.zoomOut')} size="sm" onClick={props.onZoomOut} />
					<RoundBtn icon="plus" label={t('a11y.zoomIn')} size="sm" onClick={props.onZoomIn} />
				</div>
			</div>

			<RoundBtn
				class="bottombar-boost"
				icon="boost"
				label={t('a11y.boost')}
				size="xl"
				tone="goal"
				onPointerDown={onBoostDown}
			/>
		</div>
	);
}
