import {Application, Container, TilingSprite} from 'pixi.js';
import {
	Physics, pointsToStrokes, splitWallStrokesToChunks, getNearStrokesByPoint,
	createLoop, type Loop, type Body, type ChunkMap,
} from '@dead-spin/engine';
import {
	PLAYER_RADIUS, STAR_RADIUS, FINISH_RADIUS, FINISH_MAX_SPEED, BOOST_FORCE,
	FUEL_CONSUMPTION_PER_BOOST,
} from '@dead-spin/shared';
import type {Level, GhostRecording} from '@dead-spin/shared';

import {Camera} from './camera';
import {Recorder} from './recorder';
import {GhostPlayer} from './ghost-player';
import {caveTexturesForLevel, loadGameTextures, loadShipTexture, type GameTextures} from './assets';
import {getActiveSkinId, getSkinById} from '../stores/skin';
import {progressStore} from '../stores/progress';
import {createWallsLayer, type WallsLayer} from './renderers/walls';
import {createPlayer} from './renderers/player';
import {createStar, animateStarSpawn, type StarSprite} from './renderers/stars';
import {createStartMarker, createFinishMarker} from './renderers/finish';

import {createStone} from './enemies/stone';
import {createMine} from './enemies/mine';
import {createWorm} from './enemies/worm';
import type {Enemy} from './enemies/types';
import {createSmokeSystem, type SmokeSystem} from './effects/smokes';
import {createExplosion, type ExplosionHandle} from './effects/explosion';
import {createDecorationsLayer, type DecorationsLayer} from './renderers/decorations';
import {audio} from './audio';


export type GameResult = {
	type: 'win' | 'loose';
	stars: number;
	timeMs: number;
	fuelSpent: number;
};

export type GameCallbacks = {
	onFuelChange: (fuelLeft: number) => void;
	onStarsChange: (starsCollected: number) => void;
	onTimeChange: (ms: number) => void;
	onResult: (res: GameResult) => void;
};


export class GameWorld {
	private app = new Application();
	private loop: Loop | null = null;

	private world = new Container();
	private walls: WallsLayer | null = null;
	private camera!: Camera;
	private textures!: GameTextures;

	private player: Body = this.freshPlayer();
	private playerSprite!: ReturnType<typeof createPlayer>;

	private chunks: ChunkMap = {};
	private stars: StarSprite[] = [];
	private enemies: Enemy[] = [];
	private smokes: SmokeSystem | null = null;
	private explosions: ExplosionHandle[] = [];
	private decorations: DecorationsLayer | null = null;
	private lightLayer: TilingSprite | null = null;

	private fuel = 0;
	private initialFuel = 0;
	private time = 0;
	private collected = 0;
	private result: GameResult | null = null;
	private recorder: Recorder | null = null;
	private ghost: GhostPlayer | null = null;
	private ghostRecording: GhostRecording | null = null;

	// Каждый тап буста запускает envelope-анимацию пламени:
	// expand → flicker hold → decay. Re-tap до окончания просто перезапускает с 0.
	private boostStartedAt = -1;
	private static readonly BOOST_FLAME_MS = 280;
	private resizeObserver: ResizeObserver | null = null;
	private zoom = 1;
	private paused = false;

	// Анимации входа/выхода из дыры: на старте корабль "вылетает" из дыры
	// (разворачивается и увеличивается в размере, крутясь); на финише —
	// засасывается в дыру (скручивается и сжимается в точку).
	private animState: 'spawn' | 'running' | 'finishing' = 'spawn';
	private animStart = 0;
	private finishFrom: {x: number; y: number} | null = null;
	private readonly SPAWN_MS = 900;
	private readonly FINISH_MS = 800;


	constructor(
		private level: Level,
		private levelNumber: number,
		private callbacks: GameCallbacks,
	) {}


	async mount(host: HTMLElement, initialFuel: number): Promise<void> {
		this.fuel = initialFuel;
		this.initialFuel = initialFuel;
		this.callbacks.onFuelChange(this.fuel);

		const storedZoom = Number(localStorage.getItem('dead-spin.sceneZoom'));
		this.zoom = Number.isFinite(storedZoom) && storedZoom >= 0.6 && storedZoom <= 1.4 ? storedZoom : 1;

		this.textures = await loadGameTextures();
		// Активный скин валидируется по текущему прогресс-контексту: в группе
		// это звёзды только этой беседы, в DM — глобальные. Если выбранный
		// скин залочен в текущем контексте, фолбэчимся на prospector
		// (см. getActiveSkinId в stores/skin.ts).
		const activeSkin = getActiveSkinId(progressStore.getState().summaryStars);
		this.textures = {...this.textures, ship: await loadShipTexture(activeSkin)};

		await this.app.init({
			resizeTo: host,
			backgroundColor: 0x19130f,
			antialias: true,
			autoDensity: true,
			resolution: window.devicePixelRatio || 1,
		});
		host.appendChild(this.app.canvas);

		this.app.stage.addChild(this.world);
		this.camera = new Camera(this.world, this.app.screen.width, this.app.screen.height);

		this.resizeObserver = new ResizeObserver(() => {
			this.camera.setViewport(this.app.screen.width, this.app.screen.height);
		});
		this.resizeObserver.observe(host);

		this.buildScene();
		this.resetPlayer();
		this.resetRecorder();
		this.refreshGhost();
		this.prepareSpatialIndex();
		this.beginSpawnAnim();

		this.loop = createLoop(
			(dt) => this.step(dt),
			() => this.draw(),
		);
		this.loop.start();
	}


	destroy(): void {
		this.loop?.stop();
		this.resizeObserver?.disconnect();
		// Музыку не трогаем — она фоновая и живёт между меню/игрой.
		// Короткие SFX сами доиграют, worm-loop остановится в enemy.destroy().
		this.app.destroy(true, {children: true, texture: false});
	}


	restart(initialFuel: number): void {
		this.fuel = initialFuel;
		this.initialFuel = initialFuel;
		this.time = 0;
		this.collected = 0;
		this.result = null;
		this.callbacks.onFuelChange(this.fuel);
		this.callbacks.onStarsChange(this.collected);
		this.callbacks.onTimeChange(0);

		for (const e of this.enemies) e.destroy();
		this.enemies = [];
		for (const ex of this.explosions) ex.destroy();
		this.explosions = [];
		this.smokes?.destroy();
		this.smokes = null;
		this.decorations?.destroy();
		this.decorations = null;
		this.lightLayer?.destroy();
		this.lightLayer = null;

		this.world.removeChildren();
		this.buildScene();
		this.resetPlayer();
		this.resetRecorder();
		this.refreshGhost();
		this.beginSpawnAnim();
	}


	private resetRecorder(): void {
		this.recorder = new Recorder({
			level: this.levelNumber,
			gravity: this.level.gravity,
		});
		this.recorder.add('start', 0, this.player);
	}


	getRecording(): GhostRecording | null {
		return this.recorder ? this.recorder.finalize() : null;
	}


	/**
	 * Установить запись лидера для воспроизведения как ghost. null — убрать.
	 * Вызывать можно как до, так и после mount(); если сцена ещё не готова,
	 * запись запомнится и применится в первом `refreshGhost()`.
	 */
	setGhostRecording(rec: GhostRecording | null): void {
		this.ghostRecording = rec;
		this.refreshGhost();
	}


	private refreshGhost(): void {
		if (this.ghost) {
			this.ghost.destroy();
			this.ghost = null;
		}
		if (!this.ghostRecording || !this.textures || !this.playerSprite) return;
		this.ghost = new GhostPlayer(this.ghostRecording, this.textures.ship, this.textures.booster);
		// Помещаем под спрайт игрока, чтобы наш корабль перекрывал ghost'а
		// при пересечении (визуально приоритет на нашем).
		const idx = this.world.getChildIndex(this.playerSprite.container);
		this.world.addChildAt(this.ghost.container, idx);
	}


	private beginSpawnAnim(): void {
		this.animState = 'spawn';
		this.animStart = performance.now();
		this.playerSprite.container.visible = true;
		this.playerSprite.container.scale.set(0);
		this.playerSprite.booster.visible = false;
	}


	private buildScene(): void {
		// Текстуры пещеры подбираются по миру уровня (CERES/PALLAS/...) — см. caveTexturesForLevel.
		const {outer, inner} = caveTexturesForLevel(Number(this.level.name), this.textures);
		this.walls = createWallsLayer(this.level, outer, inner);
		this.world.addChild(this.walls.container);

		// Декорации — между стенами и маркерами, как фоновый слой сцены.
		this.decorations = createDecorationsLayer(this.level.decorations);
		this.world.addChild(this.decorations.container);

		this.world.addChild(createStartMarker(this.level.startPoint, this.textures.hole, this.levelNumber));
		this.world.addChild(createFinishMarker(this.level.finishPoint, this.textures.hole, this.levelNumber));

		// Дымы рендерятся под врагами/игроком, но поверх стен.
		this.smokes = createSmokeSystem(this.textures.explosion);
		this.world.addChild(this.smokes.container);

		this.stars = [
			createStar('1', this.level.star1, this.textures.star),
			createStar('2', this.level.star2, this.textures.star),
			createStar('3', this.level.star3, this.textures.star),
		];
		for (const s of this.stars) this.world.addChild(s.container);

		this.buildEnemies();

		const skinId = getActiveSkinId(progressStore.getState().summaryStars);
		const nozzle = getSkinById(skinId).nozzle;
		this.playerSprite = createPlayer(this.textures.ship, this.textures.booster, nozzle);
		this.world.addChild(this.playerSprite.container);

		// Световой слой — repeat-тайл light.png поверх всей сцены. Он в world,
		// значит движется вместе с миром (как в Game.svelte:418-428, где
		// light.png был внутри scene-div через background-repeat).
		// tileScale 3.5 — каждый «лепесток» света заметно крупнее, не дробится
		// частой решёткой по экрану.
		const pad = 500;
		this.lightLayer = new TilingSprite({
			texture: this.textures.light,
			width: this.level.res.x + pad * 2,
			height: this.level.res.y + pad * 2,
		});
		this.lightLayer.position.set(-pad, -pad);
		this.lightLayer.tileScale.set(3.5, 3.5);
		this.lightLayer.alpha = 0.5;
		this.world.addChild(this.lightLayer);
	}


	private buildEnemies(): void {
		if (!this.smokes) return;
		for (const e of this.level.enemies) {
			let enemy: Enemy | null = null;
			if (e.name === 'stone') {
				enemy = createStone(
					{x: e.x, y: e.y, r: e.r, radius: e.radius, speed: e.speed},
					this.textures.stone,
					this.smokes,
				);
			} else if (e.name === 'mine') {
				enemy = createMine(
					{x: e.x, y: e.y, r: e.r, radius: e.radius},
					this.textures.mine,
				);
			} else if (e.name === 'worm') {
				// Маршрут червя «прибит» к ключевым точкам уровня — иначе
				// он раньше гулял в случайном углу, и при «плохом» seed'е
				// игроки слышали звук, но самого червя не видели. Теперь
				// сплайн физически проходит через старт, звёзды и финиш с
				// jitter-вставками, а timing-сдвиг — через safeFromPlayer.
				const wp = [
					this.level.startPoint,
					this.level.star1,
					this.level.star2,
					this.level.star3,
					this.level.finishPoint,
				];
				enemy = createWorm(
					{seed: e.seed, x: e.x, y: e.y},
					this.level.res.x, this.level.res.y,
					{worm1: this.textures.worm1, worm2: this.textures.worm2, worm3: this.textures.worm3},
					this.smokes,
					1,
					this.level.startPoint,
					wp,
				);
			}
			if (enemy) {
				this.enemies.push(enemy);
				this.world.addChild(enemy.container);
			}
		}
	}


	private prepareSpatialIndex(): void {
		const strokes = this.level.walls.flatMap(poly => pointsToStrokes(poly));
		this.chunks = splitWallStrokesToChunks(strokes);
	}


	private freshPlayer(): Body {
		return {
			radius: PLAYER_RADIUS,
			x: 0, y: 0,
			r: 0, vx: 0, vy: 0,
			vr: 360, speed: 0,
		};
	}


	private resetPlayer(): void {
		this.player.x = this.level.startPoint.x;
		this.player.y = this.level.startPoint.y;
		this.player.r = 0;
		this.player.vx = 0;
		this.player.vy = 0;
		this.player.speed = 0;
	}


	boost(): void {
		if (this.result || this.paused) return;
		// Во время анимаций выхода/захода в дыру — буст недоступен.
		if (this.animState !== 'running') return;
		if (this.fuel < FUEL_CONSUMPTION_PER_BOOST) return;

		Physics.applyForce(this.player, BOOST_FORCE);
		this.fuel -= FUEL_CONSUMPTION_PER_BOOST;
		this.callbacks.onFuelChange(this.fuel);
		this.boostStartedAt = performance.now();

		// Снимок ПОСЛЕ applyForce — в vx/vy уже зашит импульс. Replay
		// ghost'а на этом event'е резко перезапишет state, и между
		// boost'ами пойдёт ballistic-движение по гравитации.
		this.recorder?.add('boost', this.time, this.player);

		audio.play('booster', 0.7);

		// Дым за соплом — в 35px от центра в противоположном направлении от носа.
		if (this.smokes) {
			const rad = ((this.player.r + 180) * Math.PI) / 180;
			const ox = 35 * Math.sin(rad);
			const oy = -35 * Math.cos(rad);
			this.smokes.add(
				{x: this.player.x + ox, y: this.player.y + oy},
				80,
				2000,
				{x: ox * 3, y: oy * 3},
			);
		}
	}

	setZoom(value: number): void {
		const clamped = Math.max(0.6, Math.min(1.4, value));
		this.zoom = clamped;
		localStorage.setItem('dead-spin.sceneZoom', String(clamped));
	}
	getZoom(): number { return this.zoom; }
	addZoom(delta: number): void { this.setZoom(this.zoom + delta); }

	setPaused(paused: boolean): void { this.paused = paused; }


	private step(dt: number): void {
		if (this.result || this.paused) return;
		// Во время анимаций появления/засасывания физика заморожена,
		// столкновения не считаются, таймер не тикает.
		if (this.animState !== 'running') return;

		let r = this.player.r + this.player.vr * dt;
		while (r < -180) r += 360;
		while (r > 180) r -= 360;
		this.player.r = r;

		this.player.vx += this.level.gravity.x * dt;
		this.player.vy += this.level.gravity.y * dt;
		this.player.x += this.player.vx * dt;
		this.player.y += this.player.vy * dt;

		this.time += Math.round(dt * 1000);
		this.callbacks.onTimeChange(this.time);

		// Призрак движется в реальном игровом времени; pause/result обработаны
		// выше — в step() мы доходим только в running-state, поэтому тут
		// безопасно. Replay внутри ghost'а сам snap'ит state'ом на event'ах
		// и считает ballistic между ними.
		this.ghost?.setTime(this.time);

		const near = getNearStrokesByPoint(this.chunks, this.player);
		if (Physics.checkMovingCircle(this.player, near, dt)) {
			this.triggerLoose();
			return;
		}

		// Враги (обновление + коллизии)
		for (const enemy of this.enemies) {
			if (enemy.step(this.player, this.chunks, dt)) {
				// Если враг сообщает собственную позицию (мина/камень) — эмитим
				// дополнительный взрыв там же, чтобы враг не оставался торчать.
				const hp = enemy.getHitPosition?.();
				if (hp) {
					const ex = createExplosion(hp, this.textures.explosion);
					this.world.addChild(ex.container);
					this.explosions.push(ex);
				}
				this.triggerLoose();
				return;
			}
		}
		// Stone-stone collisions: попарный elastic ответ. Камни одной массы,
		// поэтому при столкновении меняем нормальные компоненты скорости.
		const stoneBodies: Body[] = [];
		for (const e of this.enemies) if (e.name === 'stone' && e.body) stoneBodies.push(e.body);
		for (let i = 0; i < stoneBodies.length; i++) {
			for (let j = i + 1; j < stoneBodies.length; j++) {
				const a = stoneBodies[i]!, b = stoneBodies[j]!;
				const dx = b.x - a.x, dy = b.y - a.y;
				const dist = Math.hypot(dx, dy);
				const sumR = a.radius + b.radius;
				if (dist >= sumR || dist === 0) continue;
				const nx = dx / dist, ny = dy / dist;
				// Раздвигаем тела чтобы избавиться от перекрытия (по половине каждому)
				const overlap = sumR - dist;
				a.x -= nx * overlap * 0.5;
				a.y -= ny * overlap * 0.5;
				b.x += nx * overlap * 0.5;
				b.y += ny * overlap * 0.5;
				// Скорость сближения по нормали; если уже расходятся — пропускаем
				const vRelN = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
				if (vRelN >= 0) continue;
				// Equal-mass elastic: каждый получает ±vRelN·n
				a.vx += vRelN * nx;
				a.vy += vRelN * ny;
				b.vx -= vRelN * nx;
				b.vy -= vRelN * ny;
			}
		}

		const finishCircle = {x: this.level.finishPoint.x, y: this.level.finishPoint.y, radius: FINISH_RADIUS};
		if (Physics.resolveCollision(this.player, finishCircle) && this.player.speed < FINISH_MAX_SPEED) {
			this.beginFinishAnim();
			return;
		}

		for (const star of this.stars) {
			if (!star.container.visible) continue;
			const hit = Physics.resolveCollision(this.player, {x: star.pos.x, y: star.pos.y, radius: STAR_RADIUS});
			if (hit) {
				star.container.visible = false;
				this.collected++;
				this.callbacks.onStarsChange(this.collected);
				audio.play('star-catch');
				break;
			}
		}
	}


	private triggerLoose(): void {
		// Взрыв на текущей позиции игрока
		const ex = createExplosion({x: this.player.x, y: this.player.y}, this.textures.explosion);
		this.world.addChild(ex.container);
		this.explosions.push(ex);

		audio.play('explosion3', 0.8);

		// Скрываем корабль — выглядит как при оригинале (player = null в Game.svelte).
		this.playerSprite.container.visible = false;

		this.finish('loose');
	}


	private beginFinishAnim(): void {
		this.animState = 'finishing';
		this.animStart = performance.now();
		this.finishFrom = {x: this.player.x, y: this.player.y};
		this.player.vx = 0;
		this.player.vy = 0;
	}


	private finish(type: 'win' | 'loose'): void {
		this.result = {
			type,
			stars: this.collected,
			timeMs: this.time,
			fuelSpent: Math.max(0, this.initialFuel - this.fuel),
		};
		this.recorder?.add(type, this.time, this.player);
		// Сообщаем сразу — UI сам решит когда показывать overlay. Это позволяет
		// запустить shake/вспышку параллельно со взрывом, а показ ResultScreen
		// отложить в GameScreen (через setTimeout на его стороне).
		this.callbacks.onResult(this.result);
	}


	/**
	 * Envelope-анимация пламени бустера для одного тапа:
	 *   t  0 ──── 0.18 ─── 0.55 ──── 1.0
	 *   sx 0.5 ───→ 1.25 → 1.0 ──→ 0    (стадии: expand → hold → decay)
	 *   sy 0.7 ───→ 1.35 → 1.1 ──→ 0    (Y чуть длиннее — пламя шлейфом)
	 * + высокочастотный flicker через сумму двух sin'ов разной фазы.
	 * Каждый scale.set(...) умножается на baseScale, чтобы native-размер
	 * текстуры не сбрасывал desired 27×57 px.
	 */
	private tickBoosterFlame(now: number): void {
		const elapsed = now - this.boostStartedAt;
		const dur = GameWorld.BOOST_FLAME_MS;
		if (this.boostStartedAt < 0 || elapsed >= dur) {
			this.playerSprite.booster.visible = false;
			return;
		}
		const t = elapsed / dur;
		let sx: number, sy: number;
		if (t < 0.18) {
			const u = t / 0.18;
			sx = 0.5 + 0.75 * u;
			sy = 0.7 + 0.65 * u;
		} else if (t < 0.55) {
			const u = (t - 0.18) / (0.55 - 0.18);
			sx = 1.25 - 0.25 * u;
			sy = 1.35 - 0.25 * u;
		} else {
			const u = (t - 0.55) / 0.45;
			sx = 1.0 * (1 - u);
			sy = 1.1 * (1 - u * u);
		}
		// Flicker: высокочастотные мелкие колебания, как реальное пламя
		const flick = Math.sin(elapsed * 0.09) * 0.06 + Math.sin(elapsed * 0.14) * 0.04;
		sx += flick;
		sy += flick * 0.4;

		const alpha =
			t < 0.15 ? t / 0.15 :
			t < 0.7 ? 1 :
			Math.max(0, 1 - (t - 0.7) / 0.3);

		const bs = this.playerSprite;
		bs.booster.scale.set(bs.boosterBaseScaleX * sx, bs.boosterBaseScaleY * sy);
		bs.booster.alpha = alpha;
		bs.booster.visible = true;
	}


	private draw(): void {
		const now = performance.now();

		if (this.animState === 'spawn') {
			const elapsed = now - this.animStart;
			const t = Math.min(1, elapsed / this.SPAWN_MS);
			// ease-out — быстро вылетает и тормозит
			const eased = 1 - (1 - t) * (1 - t);
			const spinRad = t * Math.PI * 6; // ~3 оборота за время анимации
			this.playerSprite.container.position.set(this.player.x, this.player.y);
			this.playerSprite.container.scale.set(eased);
			this.playerSprite.container.rotation = spinRad;
			this.playerSprite.booster.visible = false;
			if (t >= 1) {
				this.animState = 'running';
				this.playerSprite.container.scale.set(1);
				// синхронизируем физический угол с визуальным, чтобы не было прыжка
				this.player.r = ((spinRad * 180) / Math.PI) % 360;
			}
		} else if (this.animState === 'finishing') {
			const elapsed = now - this.animStart;
			const t = Math.min(1, elapsed / this.FINISH_MS);
			// ease-in — начинает медленно, ускоряется к центру дыры
			const eased = t * t;
			const from = this.finishFrom ?? {x: this.player.x, y: this.player.y};
			const fp = this.level.finishPoint;
			this.player.x = from.x + (fp.x - from.x) * eased;
			this.player.y = from.y + (fp.y - from.y) * eased;
			const spinRad = t * Math.PI * 8; // ~4 оборота, быстрее к концу
			this.playerSprite.container.position.set(this.player.x, this.player.y);
			this.playerSprite.container.scale.set(1 - eased);
			this.playerSprite.container.rotation = (this.player.r * Math.PI) / 180 + spinRad;
			this.playerSprite.booster.visible = false;
			if (t >= 1) {
				this.playerSprite.container.visible = false;
				this.animState = 'running'; // флаг нужен, чтобы step() не перезапустил анимацию
				this.finish('win');
			}
		} else if (this.playerSprite.container.visible) {
			this.playerSprite.container.position.set(this.player.x, this.player.y);
			this.playerSprite.container.rotation = (this.player.r * Math.PI) / 180;
			this.tickBoosterFlame(now);
		}

		for (const s of this.stars) if (s.container.visible) animateStarSpawn(s, now);

		// Дым, взрывы и декорации живут даже на паузе — как в оригинале.
		this.smokes?.tick(now);
		this.decorations?.tick(now);
		for (let i = this.explosions.length - 1; i >= 0; i--) {
			if (!this.explosions[i]!.tick(now)) {
				this.explosions[i]!.destroy();
				this.explosions.splice(i, 1);
			}
		}

		this.camera.follow({x: this.player.x, y: this.player.y}, this.zoom);

		if (this.walls) {
			// Параллакс задней стены. tilePosition применяет ОБРАТНЫЙ сдвиг
			// внутри TilingSprite, который сам едет с миром. Итоговая скорость
			// на экране = world_speed × (1 − k). k=0.15 даёт ~85% скорости —
			// чуть заметнее разрыв между задником и стенами пещеры чем при 0.07.
			const k = 0.15;
			this.walls.innerCave.tilePosition.set(
				this.player.x * k,
				this.player.y * k,
			);
		}
	}
}
