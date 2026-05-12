import {For, Show, createEffect, createMemo, createSignal} from 'solid-js';
import {FUEL_CONSUMPTION_PER_BOOST, LEVEL_COUNT} from '@dead-spin/shared';
import {getLevelByNumber, getPreviousLevelNumber} from '@dead-spin/levels';
import {useAuth, authStore} from '../stores/auth';
import {useProgress, progressStore} from '../stores/progress';
import {useLiveFuel} from '../stores/fuel';
import {useChallenge} from '../stores/challenge';
import {groupStore} from '../stores/group';
import {api} from '../net/client';
import {track} from '../analytics';


const WORLD_NAMES = ['CERES', 'PALLAS', 'JUNO', 'VESTA', 'EUNOMIA'] as const;
// 1:1 с оригиналом: фон квадрата задан только для двух первых миров.
// Для остальных сквозь квадрат просвечивает общий main-menu-bg родителя.
const WORLD_BG: Record<number, string | undefined> = {
	0: '/cave1.jpg',
	1: '/cave2-1.jpg',
};


type LevelCell = {number: number; stars: number; available: boolean; exists: boolean} | null;


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

		// `available` теперь резолвится через предыдущий-существующий-уровень,
		// чтобы дырка между мирами (CERES 1-3 → PALLAS 16-30) не делала
		// все PALLAS-карточки навсегда заблокированными.
		// Карточка для несуществующего уровня (нет в data/) — навсегда locked
		// с пометкой `exists=false`.
		for (let i = 0; i < 15; i++) {
			const rowIndex = Math.floor(i / 3);
			const number = from + i + 1;
			const rec = levelsMap[number];
			const exists = getLevelByNumber(number) !== undefined;
			let available = false;
			if (exists) {
				const prevNum = getPreviousLevelNumber(number);
				available = prevNum === null || (levelsMap[prevNum] !== undefined);
			}
			rows[rowIndex]!.push({
				number,
				stars: rec?.stars ?? 0,
				available,
				exists,
			});
		}
		return rows;
	});

	const liveFuel = useLiveFuel();
	const fuelK = () => (liveFuel() / 1000).toFixed(2);
	// Минимум для запуска: ~1 буст × 5 (нужно дать корабли хотя бы стартовать).
	const MIN_FUEL_TO_START = FUEL_CONSUMPTION_PER_BOOST * 5;
	const [showLowFuel, setShowLowFuel] = createSignal(false);
	const [pendingLevel, setPendingLevel] = createSignal<number | null>(null);

	const tryPlay = (n: number): void => {
		if (liveFuel() < MIN_FUEL_TO_START) {
			setPendingLevel(n);
			setShowLowFuel(true);
			return;
		}
		props.onPlay(n);
	};

	const SKIP_LOW_FUEL_COST = 50;

	const skipFuelGate = async (): Promise<void> => {
		const u = authStore.getState().user;
		if (!u || u.coins < SKIP_LOW_FUEL_COST) return;
		const n = pendingLevel();
		if (n === null) return;
		try {
			const res = await api.spendCoins(SKIP_LOW_FUEL_COST, 'skip_low_fuel');
			authStore.getState().setUser({...u, coins: res.coins});
			track('skip_low_fuel', {level: n, coins_spent: SKIP_LOW_FUEL_COST});
			setShowLowFuel(false);
			setPendingLevel(null);
			props.onPlay(n);
		} catch (e) {
			console.warn('skip_low_fuel failed:', e);
		}
	};

	const userCoins = (): number => auth().user?.coins ?? 0;
	const canSkip = (): boolean => userCoins() >= SKIP_LOW_FUEL_COST;
	const summary = () => progress().summaryStars;

	// Подсветка карточки уровня, на котором сейчас активный челлендж — но
	// только если открыты в той же беседе, где челлендж создан. В DM/чужой
	// беседе не подсвечиваем — там этот челлендж не играется.
	const challengeState = useChallenge();
	const challengeLevel = (): number | null => {
		const c = challengeState().current;
		if (!c) return null;
		const g = groupStore.getState();
		if (g.chatId !== c.chatId) return null;
		return c.level;
	};

	const prevWorld = () => setWorldIndex(w => Math.max(0, w - 1));
	const nextWorld = () => setWorldIndex(w => Math.min(4, w + 1));

	return (
		<div class="levels-root">
			<div class="levels-top">
				<img class="pressable" src="/btn-close.png" style={{height: '60px'}} alt="Close" onClick={props.onBack} />

				<div class="world-title">{WORLD_NAMES[worldIndex()]}</div>

				<div class="panel">
					<img class="icon-inline" src="/icons/fuel-icon.png" alt="" />
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
													classList={{
														locked: !c().available,
														pressable: c().available,
														'lvl-btn--challenge': challengeLevel() === c().number,
													}}
													onClick={() => c().available && tryPlay(c().number)}
												>
													<Show when={challengeLevel() === c().number}>
														<img class="lvl-btn__challenge-badge" src="/icons/challenge-icon.png" alt="" />
													</Show>
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

			<Show when={showLowFuel()}>
				<div class="lowfuel-overlay" onClick={() => { setShowLowFuel(false); setPendingLevel(null); }}>
					<div class="lowfuel-card" onClick={(e) => e.stopPropagation()}>
						<img class="lowfuel-icon" src="/icons/fuel-icon.png" alt="" />
						<div class="lowfuel-text">{liveFuel()} / {MIN_FUEL_TO_START}</div>
						<div class="lowfuel-hint">WAIT</div>
						<button
							class="lowfuel-skip pressable"
							classList={{disabled: !canSkip()}}
							onClick={() => { if (canSkip()) void skipFuelGate(); }}
						>
							<img class="icon-inline" src="/icons/coins-icon.png" alt="" /> {SKIP_LOW_FUEL_COST} → играть
							<span class="lowfuel-skip-balance">{userCoins()} имеется</span>
						</button>
						<img class="pressable lowfuel-close" src="/btn-close.png" alt="" onClick={() => { setShowLowFuel(false); setPendingLevel(null); }} />
					</div>
				</div>
			</Show>
		</div>
	);
}
