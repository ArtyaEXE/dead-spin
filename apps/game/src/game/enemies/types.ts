import type {Container} from 'pixi.js';
import type {Body} from '@dead-spin/engine';
import type {ChunkMap} from '@dead-spin/engine';


/**
 * Общий контракт врага: контейнер в сцене и контроллер обновления.
 * step вызывается каждый физический кадр, возвращает true если враг
 * столкнулся с игроком → игрок разбился.
 */
export interface Enemy {
	readonly name: 'stone' | 'mine' | 'worm';
	readonly container: Container;
	/** Позиция для визуальных эффектов (взрыва при столкновении с игроком). */
	getHitPosition?: () => {x: number; y: number};
	/** Физическое тело врага (только для камней — нужно для stone-stone collision). */
	readonly body?: Body;
	step: (player: Body, wallChunks: ChunkMap, dt: number) => boolean;
	destroy: () => void;
}
