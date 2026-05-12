import {createSignal, For, onMount, Show} from 'solid-js';
import {api} from '../net/client';
import type {Achievement} from '../net/schemas';
import {authStore} from '../stores/auth';


/**
 * Экран ачивок — overlay поверх MainMenu. Показывает все 10 ачивок:
 * разблокированные с эмодзи, заблокированные затемнённым силуэтом.
 *
 * Заблокированные тоже видны намеренно: это превращается в список
 * целей за пределами «пройди уровень» — кому-то это даёт мотивацию
 * вернуться завтра «попробовать spedrunner-ачивку».
 */
export function AchievementsOverlay(props: {onClose: () => void}) {
	const [items, setItems] = createSignal<Achievement[]>([]);
	const [loading, setLoading] = createSignal(true);

	const locale = (): 'ru' | 'en' => {
		const u = authStore.getState().user;
		return u?.locale === 'ru' ? 'ru' : 'en';
	};

	onMount(() => {
		void api.achievements()
			.then(res => setItems(res.achievements))
			.catch(e => console.warn('achievements load failed:', e))
			.finally(() => setLoading(false));
	});

	const unlockedCount = () => items().filter(a => a.unlocked).length;

	return (
		<div class="ach-overlay" onClick={props.onClose}>
			<div class="ach-card" onClick={(e) => e.stopPropagation()}>
				<div class="ach-header">
					<div class="ach-title">
						<img class="icon-inline" src="/icons/trophy-icon.png" alt="" />
						Достижения
					</div>
					<div class="ach-count">
						{unlockedCount()} / {items().length || 10}
					</div>
					<img class="pressable ach-close" src="/btn-close.png" alt="" onClick={props.onClose} />
				</div>

				<Show when={!loading()} fallback={<div class="ach-loading">Загрузка…</div>}>
					<div class="ach-grid">
						<For each={items()}>
							{(a) => (
								<div class="ach-item" classList={{locked: !a.unlocked}}>
									<div class="ach-emoji">
									{a.unlocked
										? (a.icon ? <img src={a.icon} alt="" /> : a.emoji)
										: <img src="/icons/lock-icon.png" alt="locked" />}
								</div>
									<div class="ach-name">
										{locale() === 'ru' ? a.ru : a.en}
									</div>
								</div>
							)}
						</For>
					</div>
				</Show>
			</div>
		</div>
	);
}
