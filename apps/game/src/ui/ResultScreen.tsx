import {For, Show, createEffect, onCleanup} from 'solid-js';
import {getNextLevelNumber} from '@dead-spin/levels';
import type {Rating} from '@dead-spin/shared';
import {t} from '../i18n';
import {useProgress} from '../stores/progress';
import {audio} from '../game/audio';

function printTimer(ms: number, withMs: boolean = false): string {
	const totalSec = ms / 1000;
	const min = Math.floor(totalSec / 60);
	const sec = totalSec - min * 60;
	if (withMs) return `${min}:${sec.toFixed(1).padStart(4, '0')}`;
	return `${min}:${Math.floor(sec).toString().padStart(2, '0')}`;
}

export type ResultKind = 'win' | 'loose' | 'pause';

export function ResultScreen(props: {
	result: ResultKind;
	/** Рейтинг заезда (null до финиша и на паузе/проигрыше). */
	rating: Rating | null;
	collected: number;
	parTimeMs: number | null;
	parFuel: number | null;
	timeMs: number;
	fuelSpent: number;
	levelNumber: number;
	onExit: () => void;
	onRetry: () => void;
	onNext: () => void;
	onResume: () => void;
}) {
	const progress = useProgress();
	const record = () => progress().levels[props.levelNumber];
	const nextNumber = () => getNextLevelNumber(props.levelNumber);
	const starsArr = () => [1, 2, 3];

	// На win-экране звёзды появляются с задержкой 500 × N мс. На каждый
	// «проявившийся» кадр играем звук star-catch — синхронно с CSS-delay
	// из `.result-star-fg.delay-{N}`. 1:1 с оригинальным ResultScreen.svelte.
	const timers: number[] = [];
	createEffect(() => {
		for (const t of timers) clearTimeout(t);
		timers.length = 0;
		if (props.result !== 'win') return;
		for (let i = 1; i <= (props.rating?.stars ?? 0); i++) {
			timers.push(window.setTimeout(() => audio.play('star-catch'), 500 * i));
		}
	});
	onCleanup(() => {
		for (const t of timers) clearTimeout(t);
	});

	return (
		<div class="result-root">
			<div class="result-body">
				<div class="result-stats">
					<div class="panel large">
						<img class="icon-inline" src="/icons/fuel-icon.png" alt="" />-{(props.fuelSpent / 1000).toFixed(2)}
					</div>
					<div class="panel large">
						<img class="icon-inline" src="/icons/clock-icon.png" alt="" />
						{printTimer(props.timeMs, true)}
					</div>
				</div>

				<Show when={record()}>
					{(r) => (
						<div class="panel wide" style={{gap: '8px'}}>
							<img class="icon-inline" src="/icons/trophy-icon.png" alt="" style={{'margin-right': 'auto'}} />
							<span>
								<img class="icon-inline" src="/star.png" alt="" /> {r().stars}
							</span>
							<span style={{'margin-left': '12px'}}>
								<img class="icon-inline" src="/icons/clock-icon.png" alt="" /> {printTimer(r().timeMs, true)}
							</span>
						</div>
					)}
				</Show>

				<Show
					when={props.result === 'win'}
					fallback={
						<img
							class="result-mood"
							src={props.result === 'loose' ? '/icons/crash-icon.png' : '/icons/pause-icon.png'}
							alt=""
						/>
					}
				>
					<div class="result-stars">
						<For each={starsArr()}>
							{(n) => (
								<div class="result-star" classList={{mid: n === 2}}>
									<div class="result-star-bg"></div>
									<Show when={n <= (props.rating?.stars ?? 0)}>
										<div class={`result-star-fg delay-${n}`}></div>
									</Show>
								</div>
							)}
						</For>
					</div>
					<Show when={props.rating}>
						{(rt) => (
							<div class="result-rating">
								<span class="hit">{t('rating.finish')}</span>
								<span classList={{hit: rt().parHit}}>
									{t('rating.time')} {printTimer(props.timeMs, true)}
									{props.parTimeMs !== null ? ` / ${printTimer(props.parTimeMs, true)}` : ''}
								</span>
								<span classList={{hit: rt().fullClear}}>
									{t('rating.fullClear', {c: props.collected})}
									{props.parFuel !== null ? ` ≤ ${(props.parFuel / 1000).toFixed(1)}k` : ''}
								</span>
							</div>
						)}
					</Show>
				</Show>

				<div class="result-buttons">
					<img src="/btn-close.png" alt="Exit" onClick={props.onExit} />

					<Show
						when={props.result === 'pause'}
						fallback={
							<img
								class="primary"
								classList={{dim: !(props.result === 'win' && nextNumber() !== null)}}
								src="/btn-right.png"
								alt="Next"
								onClick={() => props.result === 'win' && nextNumber() !== null && props.onNext()}
							/>
						}
					>
						<img class="primary" src="/btn-play.png" alt="Resume" onClick={props.onResume} />
					</Show>

					<img src="/btn-replay.png" alt="Retry" onClick={props.onRetry} />
				</div>
			</div>
		</div>
	);
}
