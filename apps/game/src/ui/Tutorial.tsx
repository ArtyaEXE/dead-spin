

import {getLevelByNumber} from '@dead-spin/levels';
import {authStore} from '../stores/auth';
import {groupStore} from '../stores/group';
import {api} from '../net/client';


/**
 * Однократные туториал-карточки: знакомят игрока с управлением на L1 и с
 * каждым новым типом врага при первой встрече.
 *
 * Состояние хранится в БД per-context:
 *  - DM-сессия → `users.seen_tutorials` (через authStore.user)
 *  - Group-сессия → `user_group_tutorials` (через groupStore.seenTutorials)
 *
 * Раньше всё лежало в localStorage и не выживало между девайсами / чистками.
 * См. миграцию 0015_seen_tutorials.
 *
 * Минимум текста: каждая карточка — одна большая иконка + маленький
 * пульсирующий tap-хинт. "controls" показывает две иконки подряд (тап → буст).
 */


type TutorialKey = 'controls' | 'mine' | 'stone' | 'worm';


type TutorialContent = {
	primary: string;
	secondary?: string;
};


const TUTORIALS: Record<TutorialKey, TutorialContent> = {
	controls: {primary: '/icons/icon-tap.png', secondary: '/icons/icon-boost.png'},
	mine:     {primary: '/icons/icon-mine-warning.png'},
	stone:    {primary: '/icons/icon-stone-warning.png'},
	worm:     {primary: '/icons/icon-worm-warning.png'},
};


function getSeenSet(): Set<string> {
	const g = groupStore.getState();
	if (g.chatId !== null) return new Set(g.seenTutorials);
	const u = authStore.getState().user;
	return new Set(u?.seenTutorials ?? []);
}


/**
 * Помечает туториал как viewed: оптимистично обновляет local store
 * (чтобы повторный заход в очередь не показал его снова) + параллельно
 * пишет в БД. Если сетевая запись упадёт — local-update останется и
 * пользователь не увидит туториал повторно в текущей сессии. На следующем
 * /me-refresh настоящий source-of-truth подтянется с сервера.
 */
export function markSeen(key: TutorialKey): void {
	const g = groupStore.getState();
	if (g.chatId !== null) {
		g.addSeenTutorial(key);
	} else {
		const u = authStore.getState().user;
		if (u && !(u.seenTutorials ?? []).includes(key)) {
			authStore.getState().setUser({...u, seenTutorials: [...(u.seenTutorials ?? []), key]});
		}
	}
	void api.markTutorialSeen(key).catch((e) => {
		console.warn('markTutorialSeen failed:', e instanceof Error ? e.message : e);
	});
}


export function computeTutorialQueue(levelNumber: number): TutorialKey[] {
	const seen = getSeenSet();
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
