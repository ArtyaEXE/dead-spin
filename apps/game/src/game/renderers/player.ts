import {Container, Sprite, type Texture} from 'pixi.js';

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
	lampTex: Texture,
	nozzle: {x: number; y: number} = {x: -2, y: 40},
): {
	container: Container;
	booster: Sprite;
	lamp: Sprite;
	body: Sprite;
	boosterBaseScaleX: number;
	boosterBaseScaleY: number;
} {
	const container = new Container();

	// Лампа под корпусом: корабль несёт свой свет. В тёмной пещере это
	// делает три вещи разом — показывает, где ты, вылепляет пространство
	// вокруг и не даёт объектам висеть в пустоте. Аддитивный режим, потому
	// что свет складывается с тем, что под ним, а не закрашивает это.
	const lamp = new Sprite(lampTex);
	lamp.anchor.set(0.5);
	lamp.width = 460;
	lamp.height = 460;
	lamp.blendMode = 'add';
	lamp.alpha = 0.38;
	container.addChild(lamp);

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

	return {container, booster, lamp, body, boosterBaseScaleX, boosterBaseScaleY};
}
