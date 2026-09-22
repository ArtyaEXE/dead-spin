import {For, Show, createEffect, createMemo, createSignal} from 'solid-js';
import {LEVEL_COUNT} from '@dead-spin/shared';
import {getLevelByNumber, getPreviousLevelNumber} from '@dead-spin/levels';
import {useAuth} from '../stores/auth';
import {t} from '../i18n';
import {RoundBtn} from './Icon';
import {useProgress, progressStore} from '../stores/progress';

const WORLD_NAMES = ['CERES', 'PALLAS', 'JUNO', 'VESTA', 'EUNOMIA'] as const;
const WORLD_BG: Record<number, string> = {
	0: '/cave/ceres-outer.svg',
	1: '/cave/pallas-outer.svg',
	2: '/cave/juno-outer.svg',
	3: '/cave/vesta-outer.svg',
	4: '/cave/eunomia-outer.svg',
};

// Показываем только миры, у которых есть уровни. Иначе игрок с первого
// экрана видит 45 залоченных кнопок несуществующего контента.
const WORLD_COUNT = Math.ceil(LEVEL_COUNT / 15);

type LevelCell = {number: number; stars: number; available: boolean; exists: boolean} | null;

export function Levels(props: {onBack: () => void; onPlay: (levelNumber: number) => void}) {
	const auth = useAuth();
	const progress = useProgress();
	const [worldIndex, setWorldIndex] = createSignal(0);

	// Обновляем прогресс при каждом открытии экрана.
	createEffect(() => {
		if (auth().status === 'authed') {
			void progressStore
				.getState()
				.refresh()
				.catch(() => {});
		}
	});

	/**
	 * 15 уровней мира = 5 рядов по 3.
	 *
	 * Последовательная разблокировка через progress_levels.
	 */
	const levelList = createMemo<LevelCell[][]>(() => {
		const rows: LevelCell[][] = [[], [], [], [], []];
		const from = worldIndex() * 15;
		const globalLevels = progress().levels;

		for (let i = 0; i < 15; i++) {
			const rowIndex = Math.floor(i / 3);
			const number = from + i + 1;
			const exists = getLevelByNumber(number) !== undefined;

			let available = false;
			if (exists) {
				const prevNum = getPreviousLevelNumber(number);
				available = prevNum === null || globalLevels[prevNum] !== undefined;
			}

			const rec = globalLevels[number];

			rows[rowIndex]!.push({
				number,
				stars: rec?.stars ?? 0,
				available,
				exists,
			});
		}
		return rows;
	});

	const summary = () => progress().summaryStars;

	const prevWorld = () => setWorldIndex((w) => Math.max(0, w - 1));
	const nextWorld = () => setWorldIndex((w) => Math.min(WORLD_COUNT - 1, w + 1));

	return (
		<div class="levels-root">
			<div class="levels-top">
				<RoundBtn icon="close" label={t('a11y.close')} size="md" onClick={props.onBack} />

				<div class="world-title">{WORLD_NAMES[worldIndex()]}</div>
			</div>

			<div class="levels-world">
				<div
					class="levels-world-inner"
					style={{'background-image': `url(${WORLD_BG[worldIndex()] ?? '/cave/ceres-outer.svg'})`}}
				>
					<For each={levelList()}>
						{(row) => (
							<div class="levels-row">
								<For each={row}>
									{(cell) => (
										<Show when={cell} fallback={<div class="lvl-btn locked" style={{opacity: 0}} />}>
											{(c) => (
												<div
													class="lvl-btn"
													classList={{
														locked: !c().available,
														pressable: c().available,
													}}
													onClick={() => c().available && props.onPlay(c().number)}
												>
													<div>{c().number}</div>
													<div class="lvl-stars">
														<img
															class="lvl-star-1"
															classList={{'lvl-star-disabled': c().stars < 1}}
															src="/star.png"
															alt=""
														/>
														<img
															class="lvl-star-2"
															classList={{'lvl-star-disabled': c().stars < 2}}
															src="/star.png"
															alt=""
														/>
														<img
															class="lvl-star-3"
															classList={{'lvl-star-disabled': c().stars < 3}}
															src="/star.png"
															alt=""
														/>
													</div>
												</div>
											)}
										</Show>
									)}
								</For>
							</div>
						)}
					</For>
				</div>
			</div>

			<div class="levels-bottom">
				<RoundBtn icon="left" label={t('a11y.prevWorld')} size="md" disabled={worldIndex() === 0} onClick={prevWorld} />

				<div class="total-stars">
					<img src="/star.png" alt="" />
					<div>{summary()}</div>
				</div>

				<RoundBtn
					icon="right"
					label={t('a11y.nextWorld')}
					size="md"
					disabled={worldIndex() === WORLD_COUNT - 1}
					onClick={nextWorld}
				/>
			</div>
		</div>
	);
}
