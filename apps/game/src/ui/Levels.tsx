import {For, Show, createEffect, createMemo, createSignal} from 'solid-js';
import {LEVEL_COUNT} from '@dead-spin/shared';
import {useAuth} from '../stores/auth';
import {useProgress, progressStore} from '../stores/progress';


const WORLD_NAMES = ['CERES', 'PALLAS', 'JUNO', 'VESTA', 'EUNOMIA'] as const;
// 1:1 с оригиналом: фон квадрата задан только для двух первых миров.
// Для остальных сквозь квадрат просвечивает общий main-menu-bg родителя.
const WORLD_BG: Record<number, string | undefined> = {
	0: '/cave1.jpg',
	1: '/cave2-1.jpg',
};


type LevelCell = {number: number; stars: number; available: boolean} | null;


export function Levels(props: {onBack: () => void; onPlay: (levelNumber: number) => void}) {
	const auth = useAuth();
	const progress = useProgress();
	const [worldIndex, setWorldIndex] = createSignal(0);

	// Обновляем прогресс при каждом открытии экрана — игрок мог пройти
	// уровень и вернуться с новой записью с сервера.
	createEffect(() => {
		if (auth().status === 'authed') {
			void progressStore.getState().refresh().catch(() => {});
		}
	});

	/**
	 * 15 уровней мира = 5 рядов по 3. Уровни в новой системе пока единые
	 * 1..15 — но интерфейс миров (5 миров по 15) оставлен как у оригинала,
	 * чтобы потом было куда расширять.
	 */
	const levelList = createMemo<LevelCell[][]>(() => {
		const rows: LevelCell[][] = [[], [], [], [], []];
		const from = worldIndex() * 15;
		const levelsMap = progress().levels;

		let highestCleared = 0;
		for (let i = 1; i <= LEVEL_COUNT; i++) if (levelsMap[i]) highestCleared = i;

		// Как в оригинале: каждый мир показывает 15 кнопок (number = 16..30, 31..45, …).
		// Уровни сверх LEVEL_COUNT отображаются, но заблокированы — контент добавится
		// вместе с ростом LEVEL_COUNT.
		for (let i = 0; i < 15; i++) {
			const rowIndex = Math.floor(i / 3);
			const number = from + i + 1;
			const rec = levelsMap[number];
			rows[rowIndex]!.push({
				number,
				stars: rec?.stars ?? 0,
				available: number <= LEVEL_COUNT && number <= highestCleared + 1,
			});
		}
		return rows;
	});

	const fuelK = () => ((auth().user?.fuel ?? 0) / 1000).toFixed(2);
	const summary = () => progress().summaryStars;

	const prevWorld = () => setWorldIndex(w => Math.max(0, w - 1));
	const nextWorld = () => setWorldIndex(w => Math.min(4, w + 1));

	return (
		<div class="levels-root">
			<div class="levels-top">
				<img class="pressable" src="/btn-close.png" style={{height: '60px'}} alt="Close" onClick={props.onBack} />

				<div class="world-title">{WORLD_NAMES[worldIndex()]}</div>

				<div class="panel">
					<i class="fa fa-tint" style={{'margin-right': '6px'}}></i>
					{fuelK()}
				</div>
			</div>

			<div class="levels-world">
				<div
					class="levels-world-inner"
					classList={{'no-bg': !WORLD_BG[worldIndex()]}}
					style={WORLD_BG[worldIndex()] ? {'background-image': `url(${WORLD_BG[worldIndex()]})`} : {}}
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
													classList={{locked: !c().available, pressable: c().available}}
													onClick={() => c().available && props.onPlay(c().number)}
												>
													<div>{c().number}</div>
													<div class="lvl-stars">
														<img class="lvl-star-1" classList={{'lvl-star-disabled': c().stars < 1}} src="/star.png" alt="" />
														<img class="lvl-star-2" classList={{'lvl-star-disabled': c().stars < 2}} src="/star.png" alt="" />
														<img class="lvl-star-3" classList={{'lvl-star-disabled': c().stars < 3}} src="/star.png" alt="" />
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
				<img
					class="pressable"
					src="/btn-left.png"
					style={{height: '60px', opacity: worldIndex() === 0 ? 0.35 : 1}}
					alt="Prev world"
					onClick={prevWorld}
				/>

				<div class="total-stars">
					<img src="/star.png" alt="" />
					<div>{summary()}</div>
				</div>

				<img
					class="pressable"
					src="/btn-right.png"
					style={{height: '60px', opacity: worldIndex() === 4 ? 0.35 : 1}}
					alt="Next world"
					onClick={nextWorld}
				/>
			</div>
		</div>
	);
}
