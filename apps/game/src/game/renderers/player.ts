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
} {
	const container = new Container();

	// Бустер: якорь сверху-центр, начинается ровно под корпусом (y = radius 40).
	const booster = new Sprite(boosterTex);
	booster.anchor.set(0.5, 0);
	booster.x = 0;
	booster.y = 40;
	booster.width = 30;
	booster.height = 40;
	booster.visible = false;
	container.addChild(booster);

	const body = new Sprite(shipTex);
	body.anchor.set(0.5);
	body.width = 80;
	body.height = 80;
	container.addChild(body);

	return {container, booster, body};
}
