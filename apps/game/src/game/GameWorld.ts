import {Application, Container, TilingSprite} from 'pixi.js';
import {
	Physics, pointsToStrokes, splitWallStrokesToChunks, getNearStrokesByPoint,
	createLoop, type Loop, type Body, type ChunkMap,
} from '@dead-spin/engine';
import {
	PLAYER_RADIUS, STAR_RADIUS, FINISH_RADIUS, BOOST_FORCE,
	FUEL_CONSUMPTION_PER_BOOST,
} from '@dead-spin/shared';
import type {Level} from '@dead-spin/shared';

import {Camera} from './camera';
import {loadGameTextures, type GameTextures} from './assets';
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

	private boostVisibleUntil = 0;
	private resizeObserver: ResizeObserver | null = null;
	private zoom = 1;
	private paused = false;


	constructor(private level: Level, private callbacks: GameCallbacks) {}


	async mount(host: HTMLElement, initialFuel: number): Promise<void> {
		this.fuel = initialFuel;
		this.initialFuel = initialFuel;
		this.callbacks.onFuelChange(this.fuel);

		const storedZoom = Number(localStorage.getItem('dead-spin.sceneZoom'));
		this.zoom = Number.isFinite(storedZoom) && storedZoom >= 0.6 && storedZoom <= 1.4 ? storedZoom : 1;

		this.textures = await loadGameTextures();

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
		this.prepareSpatialIndex();

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
	}


	private buildScene(): void {
		this.walls = createWallsLayer(this.level, this.textures.cave1, this.textures.cave2);
		this.world.addChild(this.walls.container);

		// Декорации — между стенами и маркерами, как фоновый слой сцены.
		this.decorations = createDecorationsLayer(this.level.decorations);
		this.world.addChild(this.decorations.container);

		this.world.addChild(createStartMarker(this.level.startPoint, this.textures.hole));
		this.world.addChild(createFinishMarker(this.level.finishPoint, this.textures.hole));

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

		this.playerSprite = createPlayer(this.textures.ship, this.textures.booster);
		this.world.addChild(this.playerSprite.container);

		// Световой слой — repeat-тайл light.png поверх всей сцены. Он в world,
		// значит движется вместе с миром (как в Game.svelte:418-428, где
		// light.png был внутри scene-div через background-repeat).
		const pad = 500;
		this.lightLayer = new TilingSprite({
			texture: this.textures.light,
			width: this.level.res.x + pad * 2,
			height: this.level.res.y + pad * 2,
		});
		this.lightLayer.position.set(-pad, -pad);
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
				enemy = createWorm(
					{seed: e.seed, x: e.x, y: e.y},
					this.level.res.x, this.level.res.y,
					{worm1: this.textures.worm1, worm2: this.textures.worm2, worm3: this.textures.worm3},
					this.smokes,
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
		if (this.fuel < FUEL_CONSUMPTION_PER_BOOST) return;

		Physics.applyForce(this.player, BOOST_FORCE);
		this.fuel -= FUEL_CONSUMPTION_PER_BOOST;
		this.callbacks.onFuelChange(this.fuel);
		this.boostVisibleUntil = performance.now() + 100;

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

		const near = getNearStrokesByPoint(this.chunks, this.player);
		if (Physics.checkMovingCircle(this.player, near, dt)) {
			this.triggerLoose();
			return;
		}

		// Враги (обновление + коллизии)
		for (const enemy of this.enemies) {
			if (enemy.step(this.player, this.chunks, dt)) {
				this.triggerLoose();
				return;
			}
		}

		const finishCircle = {x: this.level.finishPoint.x, y: this.level.finishPoint.y, radius: FINISH_RADIUS};
		if (Physics.resolveCollision(this.player, finishCircle) && this.player.speed < 40) {
			this.finish('win');
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

		// Замораживаем физику сразу, но overlay ResultScreen-а показываем с
		// задержкой 500мс (как в оригинале: `delay: result === 'pause' ? 0 : 500`) —
		// чтобы игрок успел увидеть взрыв до того как экран затемнится.
		this.result = {
			type: 'loose',
			stars: this.collected,
			timeMs: this.time,
			fuelSpent: Math.max(0, this.initialFuel - this.fuel),
		};
		setTimeout(() => {
			if (this.result) this.callbacks.onResult(this.result);
		}, 500);
	}


	private finish(type: 'win' | 'loose'): void {
		this.result = {
			type,
			stars: this.collected,
			timeMs: this.time,
			fuelSpent: Math.max(0, this.initialFuel - this.fuel),
		};
		// Для win — та же задержка 500мс (плавное появление overlay, как в оригинале).
		const delay = type === 'win' ? 500 : 0;
		setTimeout(() => {
			if (this.result) this.callbacks.onResult(this.result);
		}, delay);
	}


	private draw(): void {
		const now = performance.now();

		if (this.playerSprite.container.visible) {
			this.playerSprite.container.position.set(this.player.x, this.player.y);
			this.playerSprite.container.rotation = (this.player.r * Math.PI) / 180;
			this.playerSprite.booster.visible = now < this.boostVisibleUntil;
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
			this.walls.innerCave.tilePosition.set(
				this.player.x * (7 / 8),
				this.player.y * (7 / 8),
			);
		}
	}
}
