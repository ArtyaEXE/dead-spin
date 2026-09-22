import {getLevelByNumber} from '@dead-spin/levels';
import {profileStore} from '../stores/profile';
import type {TutorialKey} from '@dead-spin/shared';

/**
 * Однократные туториал-карточки: знакомят игрока с управлением на L1 и с
 * каждым новым типом врага при первой встрече.
 *
 * Состояние — в профиле устройства (stores/profile.ts), серверная копия
 * уходит снимком через очередь синхронизации.
 *
 * Минимум текста: каждая карточка — одна большая иконка + маленький
 * пульсирующий tap-хинт. "controls" показывает две иконки подряд (тап → буст).
 */

export type {TutorialKey};

type TutorialContent = {
	primary: string;
	secondary?: string;
};

const TUTORIALS: Record<TutorialKey, TutorialContent> = {
	controls: {primary: '/icons/icon-tap.svg', secondary: '/icons/icon-boost.svg'},
	mine: {primary: '/icons/icon-mine-warning.svg'},
	stone: {primary: '/icons/icon-stone-warning.svg'},
	worm: {primary: '/icons/icon-worm-warning.svg'},
};

function getSeenSet(): Set<string> {
	return new Set(profileStore.getState().profile.seenTutorials);
}

/** Помечает туториал просмотренным — в профиле устройства, с синхронизацией. */
export function markSeen(key: TutorialKey): void {
	profileStore.getState().markTutorialSeen(key);
}

export function computeTutorialQueue(levelNumber: number): TutorialKey[] {
	const seen = getSeenSet();
	const queue: TutorialKey[] = [];

	if (levelNumber === 1 && !seen.has('controls')) queue.push('controls');

	const level = getLevelByNumber(levelNumber);
	if (level) {
		const types = new Set(level.enemies.map((e) => e.name));
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
				<img class="tutorial-hint-icon" src="/icons/icon-tap.svg" alt="" />
			</div>
		</div>
	);
}
