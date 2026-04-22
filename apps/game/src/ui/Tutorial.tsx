import {getLevelByNumber} from '@dead-spin/levels';


/**
 * Однократные туториал-карточки: знакомят игрока с управлением на L1 и с
 * каждым новым типом врага при первой встрече. Состояние хранится в
 * localStorage — сервер не нужен, это персональное UX-предпочтение.
 */


type TutorialKey = 'controls' | 'mine' | 'stone' | 'worm';


type TutorialContent = {
	title: string;
	description: string;
	iconSrc: string;
};


const TUTORIALS: Record<TutorialKey, TutorialContent> = {
	controls: {
		title: 'ПИЛОТИРОВАНИЕ',
		description: 'Корабль постоянно вращается. Тапай по экрану — буст даст ускорение в сторону носа. Собирай звёзды и долети до дыры-выхода.',
		iconSrc: '/ship2.png',
	},
	mine: {
		title: 'МИНА',
		description: 'Взрывается при касании. Держись подальше.',
		iconSrc: '/enemies/mine/mine.png',
	},
	stone: {
		title: 'КАМЕНЬ',
		description: 'Движется по пещере. Не попади под удар.',
		iconSrc: '/enemies/stone/stone.png',
	},
	worm: {
		title: 'ЧЕРВЬ',
		description: 'Охотится в пещере и тянется к тебе. Держи дистанцию.',
		iconSrc: '/enemies/worm/s1.png',
	},
};


const SEEN_KEY = 'dead-spin.tutorials.seen';


function getSeen(): Set<string> {
	try {
		const raw = localStorage.getItem(SEEN_KEY);
		return new Set(raw ? (JSON.parse(raw) as string[]) : []);
	} catch {
		return new Set();
	}
}


export function markSeen(key: TutorialKey): void {
	const set = getSeen();
	set.add(key);
	try {
		localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
	} catch {/* storage disabled — пользователь переживёт повтор */}
}


/**
 * Порядок показа: сначала контролы (L1), потом враги в порядке mine→stone→worm.
 * Показываем только unseen из тех, что реально есть на уровне.
 */
export function computeTutorialQueue(levelNumber: number): TutorialKey[] {
	const seen = getSeen();
	const queue: TutorialKey[] = [];

	if (levelNumber === 1 && !seen.has('controls')) queue.push('controls');

	const level = getLevelByNumber(levelNumber);
	if (level) {
		const types = new Set(level.enemies.map(e => e.name));
		for (const t of ['mine', 'stone', 'worm'] as const) {
			if (types.has(t) && !seen.has(t)) queue.push(t);
		}
	}
	return queue;
}


export function TutorialOverlay(props: {tutorial: TutorialKey; onDismiss: () => void}) {
	const content = () => TUTORIALS[props.tutorial];
	return (
		<div class="tutorial-overlay" onClick={() => props.onDismiss()}>
			<div class="tutorial-card">
				<img class="tutorial-icon" src={content().iconSrc} alt="" />
				<div class="tutorial-title">{content().title}</div>
				<div class="tutorial-desc">{content().description}</div>
				<div class="tutorial-hint">ТАП — ПРОДОЛЖИТЬ</div>
			</div>
		</div>
	);
}
