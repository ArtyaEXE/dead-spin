import {createSignal, createEffect, For, Show} from 'solid-js';
import {progressStore, useProgress} from '../stores/progress';
import {useAuth} from '../stores/auth';
import {useLiveFuel} from '../stores/fuel';
import {SKINS, getSelectedSkinId, setSelectedSkinId, isSkinUnlocked, type SkinId, type SkinDef} from '../stores/skin';


/**
 * Магазин скинов ракеты. Открывается из главного меню.
 * Пять карточек: PROSPECTOR (бесплатно) + 4 скина по нарастанию ★-цены.
 * Состояние выбранного скина в localStorage (см. stores/skin.ts).
 */
export function Shop(props: {onBack: () => void}) {
	const auth = useAuth();
	const progress = useProgress();
	const liveFuel = useLiveFuel();
	const fuelK = () => (liveFuel() / 1000).toFixed(2);
	const [selected, setSelected] = createSignal<SkinId>(getSelectedSkinId());

	// Гарантируем свежий счётчик звёзд при открытии магазина — на тот случай,
	// если App-уровневый refresh не успел или упал.
	createEffect(() => {
		if (auth().status === 'authed') {
			void progressStore.getState().refresh().catch(() => {});
		}
	});

	const choose = (skin: SkinDef): void => {
		if (!isSkinUnlocked(skin, progress().summaryStars)) return;
		setSelected(skin.id);
		setSelectedSkinId(skin.id);
	};

	return (
		<div class="shop-root">
			<div class="shop-top">
				<img class="pressable" src="/btn-close.png" style={{height: '60px'}} alt="" onClick={props.onBack} />
				<div class="shop-top-meters">
					<div class="panel">
						<img src="/star.png" style={{height: '28px', 'margin-right': '6px'}} alt="" />
						{progress().summaryStars}
					</div>
					<div class="panel">
						<i class="fa fa-tint" style={{'margin-right': '6px'}}></i>
						{fuelK()}
					</div>
				</div>
			</div>

			<div class="shop-list">
				<For each={SKINS}>
					{(skin) => {
						const unlocked = (): boolean => isSkinUnlocked(skin, progress().summaryStars);
						const isSelected = (): boolean => selected() === skin.id;
						return (
							<div
								class="shop-card"
								classList={{
									locked: !unlocked(),
									selected: isSelected(),
									pressable: unlocked() && !isSelected(),
								}}
								onClick={() => choose(skin)}
							>
								<div class="shop-card-imgwrap">
									<img class="shop-card-img" src={skin.src} alt="" />
									<Show when={!unlocked()}>
										<div class="shop-card-lock">
											<i class="fa fa-lock" />
										</div>
									</Show>
								</div>
								<div class="shop-card-info">
									<div class="shop-card-name">{skin.name}</div>
									<Show when={!unlocked()} fallback={
										<div class="shop-card-state">
											{isSelected() ? 'SELECTED' : 'TAP'}
										</div>
									}>
										<div class="shop-card-cost">
											<img src="/star.png" alt="" />
											{progress().summaryStars}/{skin.requiredStars}
										</div>
									</Show>
								</div>
							</div>
						);
					}}
				</For>
			</div>
		</div>
	);
}
