

import {getLevelByNumber} from '@dead-spin/levels';


/**
 * Однократные туториал-карточки: знакомят игрока с управлением на L1 и с
 * каждым новым типом врага при первой встрече. Состояние хранится в
 * localStorage — сервер не нужен.
 *
 * Минимум текста: каждая карточка — одна большая иконка + маленький пульсирующий
 * tap-хинт. "controls" показывает две иконки подряд (тап → буст).
 */


type TutorialKey = 'controls' | 'mine' | 'stone' | 'worm';


type TutorialContent = {
	/** Одна большая иконка. */
	primary: string;
	/** Опциональная вторая иконка (для controls — "tap → boost"). */
	secondary?: string;
};


const TUTORIALS: Record<TutorialKey, TutorialContent> = {
	controls: {primary: '/icons/icon-tap.png', secondary: '/icons/icon-boost.png'},
	mine:     {primary: '/icons/icon-mine-warning.png'},
	stone:    {primary: '/icons/icon-stone-warning.png'},
	worm:     {primary: '/icons/icon-worm-warning.png'},
};


// Бумп версии (v2) принудительно сбрасывает seen-состояние у всех — туториалы
// покажутся заново, потому что localStorage-ключ другой.
const SEEN_KEY = 'dead-spin.tutorials.seen.v2';


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
	} catch {/* noop */}
}


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
				<div class="tutorial-icons">
					<img class="tutorial-icon" src={content().primary} alt="" />
					{content().secondary && (
						<>
							<div class="tutorial-arrow">›</div>
							<img class="tutorial-icon" src={content().secondary} alt="" />
						</>
					)}
				</div>
				<img class="tutorial-hint-icon" src="/icons/icon-tap.png" alt="" />
			</div>
		</div>
	);
}
