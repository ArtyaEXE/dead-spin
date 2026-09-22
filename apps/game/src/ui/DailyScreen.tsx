import {createMemo, createSignal, Show} from 'solid-js';
import {dailyLevel} from '@dead-spin/levels';
import {challengeDate, dailyStore, useDaily} from '../stores/daily';
import {track} from '../analytics';
import {GameScreen} from './GameScreen';
import {RoundBtn} from './Icon';
import {t} from '../i18n';

/**
 * Испытание дня.
 *
 * Уровень собирается из даты, поэтому он одинаковый у всех игроков и
 * исчезает в полночь. Это единственная механика плана, которая даёт причину
 * открыть игру завтра: кампания на тридцать уровней кончается за полтора
 * часа, а KPI проекта — возврат на седьмой день (GDD §19).
 *
 * Уровень нигде не хранится: он детерминированно пересобирается из даты.
 * Хранится только результат — лучшее время, лучший рейтинг и серия дней.
 *
 * Попытки не ограничены. Ограничение одной попыткой делает испытание
 * лотереей: игрок, погибший на первой мине, теряет день целиком и больше
 * не возвращается. Записывается лучший результат, как в кампании.
 */
export function DailyScreen(props: {onExit: () => void}) {
	const date = challengeDate();
	const challenge = useDaily();
	const today = () => challenge().forDate(date);

	// Генерация занимает десятки миллисекунд и детерминирована: считаем один
	// раз за монтирование, дальше уровень не меняется.
	const level = createMemo(() => dailyLevel(date));

	// Ключ перезапуска: смена значения пересоздаёт GameScreen целиком, как
	// это делает кампания при переходе между уровнями.
	const [runId, setRunId] = createSignal(0);
	const [outcome, setOutcome] = createSignal<{win: boolean; timeMs: number; stars: number} | null>(null);

	dailyStore.getState().start(date);
	track('daily_start', {date, attempt: today().attempts});

	const finish = (r: {win: boolean; timeMs: number; fuelSpent: number; collected: number; stars: number}): void => {
		dailyStore.getState().finish(date, r);
		setOutcome({win: r.win, timeMs: r.timeMs, stars: r.stars});
	};

	const retry = (): void => {
		setOutcome(null);
		dailyStore.getState().start(date);
		setRunId((n) => n + 1);
	};

	return (
		<div class="daily-root">
			<Show when={runId() >= 0} keyed>
				{(id) => (
					<GameScreen
						levelNumber={0}
						level={level()}
						mode="daily"
						onDailyResult={finish}
						onExit={props.onExit}
						onSwitchLevel={() => {
							void id;
							retry();
						}}
					/>
				)}
			</Show>

			<Show when={outcome()}>
				{(r) => (
					<div class="daily-result">
						<div class="daily-result-body">
							<div class="daily-result-title">{r().win ? t('daily.cleared') : t('daily.failed')}</div>
							<Show when={r().win}>
								<div class="daily-result-time">{fmtTime(r().timeMs)}</div>
								<div class="daily-result-sub">
									{today().bestTimeMs !== null && today().bestTimeMs === r().timeMs
										? t('daily.newBest')
										: t('daily.yourBest', {t: fmtTime(today().bestTimeMs ?? r().timeMs)})}
								</div>
							</Show>
							<Show when={challenge().streakDays > 0}>
								<div class="daily-result-streak">{t('daily.streak', {n: challenge().streakDays})}</div>
							</Show>
							<div class="daily-result-buttons">
								<RoundBtn icon="close" label={t('a11y.exit')} size="md" onClick={props.onExit} />
								<RoundBtn icon="replay" label={t('a11y.retry')} size="lg" tone="goal" onClick={retry} />
							</div>
						</div>
					</div>
				)}
			</Show>
		</div>
	);
}

export function fmtTime(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}
