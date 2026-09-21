import {createEffect, For, Show} from 'solid-js';
import {progressStore, useProgress} from '../stores/progress';
import {useAuth} from '../stores/auth';
import {t} from '../i18n';
import {RoundBtn} from './Icon';
import {useProfile} from '../stores/profile';
import {SKINS, getActiveSkinId, setSelectedSkinId, isSkinUnlocked, type SkinId, type SkinDef} from '../stores/skin';

/**
 * Магазин скинов ракеты. Открывается из главного меню.
 * Пять карточек: PROSPECTOR (бесплатно) + 4 скина по нарастанию ★-цены.
 * Выбранный скин хранится в профиле устройства (stores/profile.ts).
 */
export function Shop(props: {onBack: () => void}) {
	const auth = useAuth();
	const profile = useProfile();
	const progress = useProgress();

	// `active` — фактически применяющийся скин. Если звёзд не хватает —
	// fallback на prospector (см. stores/skin.ts:getActiveSkinId).
	const active = (): SkinId => {
		profile(); // dependency на profile.selectedSkin
		return getActiveSkinId(progress().summaryStars);
	};

	// Гарантируем свежий счётчик звёзд при открытии магазина — на тот случай,
	// если App-уровневый refresh не успел или упал.
	createEffect(() => {
		if (auth().status === 'authed') {
			void progressStore
				.getState()
				.refresh()
				.catch(() => {});
		}
	});

	const choose = async (skin: SkinDef): Promise<void> => {
		if (!isSkinUnlocked(skin, progress().summaryStars)) return;
		try {
			await setSelectedSkinId(skin.id);
		} catch (e) {
			console.warn('setSelectedSkinId failed:', e instanceof Error ? e.message : e);
		}
	};

	return (
		<div class="shop-root">
			<div class="shop-top">
				<RoundBtn icon="close" label={t('a11y.back')} size="md" onClick={props.onBack} />
				<div class="shop-top-meters">
					<div class="panel">
						<img src="/star.png" style={{height: '28px', 'margin-right': '6px'}} alt="" />
						{progress().summaryStars}
					</div>
				</div>
			</div>

			<div class="shop-list">
				<For each={SKINS}>
					{(skin) => {
						const unlocked = (): boolean => isSkinUnlocked(skin, progress().summaryStars);
						const isSelected = (): boolean => active() === skin.id;
						return (
							<div
								class="shop-card"
								classList={{
									locked: !unlocked(),
									selected: isSelected(),
									pressable: unlocked() && !isSelected(),
								}}
								onClick={() => void choose(skin)}
							>
								<div class="shop-card-imgwrap">
									<img class="shop-card-img" src={skin.src} alt="" />
									<Show when={!unlocked()}>
										<div class="shop-card-lock">
											<img src="/icons/lock-icon.png" alt="locked" />
										</div>
									</Show>
								</div>
								<div class="shop-card-info">
									<div class="shop-card-name">{skin.name}</div>
									<Show
										when={!unlocked()}
										fallback={<div class="shop-card-state">{isSelected() ? 'SELECTED' : 'TAP'}</div>}
									>
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
