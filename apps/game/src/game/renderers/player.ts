import {Container, Sprite, Texture} from 'pixi.js';


/**
 * Спрайт игрока: корпус ship + огонёк booster сзади.
 *   .body    — 80×80, anchor в центре
 *   .booster — anchor top-center, позиция из skin.nozzle
 *
 * nozzle — точка крепления бустера относительно центра спрайта.
 * У каждого скина своя: prospector {-2,40}, king {0,35} и т.д.
 * Задаётся в SKINS[] (stores/skin.ts).
 */
export function createPlayer(
	shipTex: Texture,
	boosterTex: Texture,
	nozzle: {x: number; y: number} = {x: -2, y: 40},
): {
	container: Container;
	booster: Sprite;
	body: Sprite;
	boosterBaseScaleX: number;
	boosterBaseScaleY: number;
} {
	const container = new Container();

	const booster = new Sprite(boosterTex);
	booster.anchor.set(0.5, 0);
	booster.x = nozzle.x;
	booster.y = nozzle.y;
	// baseScale считается из native-размера текстуры — 27×57 это desired в game-px.
	// Анимация в GameWorld умножает на этот baseScale, чтобы scale.set(...)
	// в каждом кадре не сбрасывал размер.
	const boosterBaseScaleX = 27 / (boosterTex.width || 27);
	const boosterBaseScaleY = 57 / (boosterTex.height || 57);
	booster.scale.set(boosterBaseScaleX, boosterBaseScaleY);
	booster.visible = false;
	container.addChild(booster);

	const body = new Sprite(shipTex);
	body.anchor.set(0.5);
	body.width = 80;
	body.height = 80;
	container.addChild(body);

	return {container, booster, body, boosterBaseScaleX, boosterBaseScaleY};
}
