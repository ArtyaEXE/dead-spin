import {For} from 'solid-js';
import {ACHIEVEMENTS, ACHIEVEMENT_KEYS} from '@dead-spin/shared';
import {useProfile} from '../stores/profile';
import {getLocale, t} from '../i18n';


/**
 * Экран ачивок — overlay поверх MainMenu. Показывает все ачивки:
 * разблокированные с иконкой, заблокированные — замком.
 *
 * Заблокированные видны намеренно: это список целей за пределами «пройди
 * уровень». Данные — из профиля устройства, сети не требует.
 */
export function AchievementsOverlay(props: {onClose: () => void}) {
	const profile = useProfile();

	const items = () => ACHIEVEMENT_KEYS.map((key) => ({
		key,
		...ACHIEVEMENTS[key],
		unlocked: Boolean(profile().profile.achievements[key]),
	}));
	const unlockedCount = () => items().filter(a => a.unlocked).length;

	return (
		<div class="ach-overlay" onClick={props.onClose}>
			<div class="ach-card" onClick={(e) => e.stopPropagation()}>
				<div class="ach-header">
					<div class="ach-title">
						<img class="icon-inline" src="/icons/trophy-icon.png" alt="" />
						{t('achievements.title')}
					</div>
					<div class="ach-count">
						{unlockedCount()} / {items().length}
					</div>
					<img class="pressable ach-close" src="/btn-close.png" alt="" onClick={props.onClose} />
				</div>

				<div class="ach-grid">
					<For each={items()}>
						{(a) => (
							<div class="ach-item" classList={{locked: !a.unlocked}}>
								<div class="ach-emoji">
									{a.unlocked
										? <img src={a.icon} alt="" />
										: <img src="/icons/lock-icon.png" alt="locked" />}
								</div>
								<div class="ach-name">
									{getLocale() === 'ru' ? a.ru : a.en}
								</div>
							</div>
						)}
					</For>
				</div>
			</div>
		</div>
	);
}
