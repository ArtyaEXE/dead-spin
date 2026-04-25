import {Container, Sprite, Texture} from 'pixi.js';


/**
 * Спрайт игрока: корпус ship2.png + огонёк booster-single.png сзади.
 * Размеры 1:1 с оригиналом (Game.svelte):
 *   .player  — 80×80, anchor в центре (контейнер поворачивается вокруг центра)
 *   .booster — 30×40, top-center, растёт ВНИЗ от нижнего края корабля
 *              (bottom: -40 в Svelte → top = player.bottom + 0 = y=radius)
 */
export function createPlayer(shipTex: Texture, boosterTex: Texture): {
	container: Container;
	booster: Sprite;
	body: Sprite;
	boosterBaseScaleX: number;
	boosterBaseScaleY: number;
} {
	const container = new Container();

	// Бустер: якорь сверху-центр, начинается ровно под корпусом (y = radius 40).
	const booster = new Sprite(boosterTex);
	booster.anchor.set(0.5, 0);
	booster.x = -2;
	booster.y = 40;
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
