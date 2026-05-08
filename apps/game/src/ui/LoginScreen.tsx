import {createSignal, createEffect, onCleanup, Show} from 'solid-js';
import {useAuth} from '../stores/auth';
import {FAKE_PASSWORD, IS_DEV} from '../config';


/**
 * Сколько мс ждём ответа от API на первом логине прежде чем показать
 * «сервер просыпается». Render free-tier cold start ~30-60 сек, поэтому
 * 12 секунд — комфортный порог: реальный быстрый отклик пройдёт без
 * лишнего сообщения, а cold-start даст пользователю понять что
 * происходит и дать кнопку Retry.
 */
const SLOW_THRESHOLD_MS = 12_000;


export function LoginScreen() {
	const auth = useAuth();
	const [tgId, setTgId] = createSignal('468311941');
	const [showSlowHint, setShowSlowHint] = createSignal(false);

	const tg = typeof window !== 'undefined'
		? (window as unknown as {Telegram?: {WebApp?: {initData?: string}}}).Telegram?.WebApp
		: undefined;
	const initData = tg?.initData ?? '';

	// Если auth висит в loading дольше SLOW_THRESHOLD_MS — показываем
	// «сервер просыпается». На каждое status-событие сбрасываем таймер.
	let slowTimer: number | null = null;
	createEffect(() => {
		const status = auth().status;
		if (slowTimer !== null) { clearTimeout(slowTimer); slowTimer = null; }
		setShowSlowHint(false);
		if (status === 'loading') {
			slowTimer = window.setTimeout(() => setShowSlowHint(true), SLOW_THRESHOLD_MS);
		}
	});
	onCleanup(() => { if (slowTimer !== null) clearTimeout(slowTimer); });

	const tryTelegram = () => {
		if (!initData) return;
		void auth().loginTelegram(initData);
	};

	const tryFake = (e: Event) => {
		e.preventDefault();
		void auth().loginFake(tgId().trim(), FAKE_PASSWORD);
	};

	const isLoading = () => auth().status === 'loading';
	const isError = () => auth().status === 'error';

	return (
		<div class="login-root">
			<div class="login-card">
				<img class="login-logo" src="/dead-spin-logo-shadow.png" alt="Dead Spin" />

				<Show when={initData} fallback={
					<Show when={IS_DEV} fallback={<div class="login-error">Open the game through Telegram.</div>}>
						<form class="login-card" style={{gap: '14px'}} onSubmit={tryFake}>
							<div class="login-sub">DEV LOGIN</div>
							<input
								class="login-input"
								type="text"
								placeholder="Telegram ID"
								value={tgId()}
								onInput={(e) => setTgId(e.currentTarget.value)}
							/>
							<button
								type="submit"
								class="login-btn pressable"
								disabled={isLoading()}
							>
								{isLoading() ? 'LOADING' : 'ENTER'}
							</button>
						</form>
					</Show>
				}>
					<button class="login-btn pressable" onClick={tryTelegram} disabled={isLoading()}>
						{isError() ? 'RETRY' : isLoading() ? 'LOADING' : 'PLAY'}
					</button>
				</Show>

				<Show when={isLoading() && showSlowHint()}>
					<div class="login-hint">
						Сервер просыпается, это займёт до минуты.<br/>
						Если зависло — нажми ещё раз.
					</div>
				</Show>

				<Show when={isError()}>
					<div class="login-error">{authErrorText(auth().error)}</div>
				</Show>
			</div>
		</div>
	);
}


function authErrorText(err: string | null): string {
	if (!err) return 'Что-то пошло не так. Попробуй ещё раз.';
	if (err === 'networkFailure') return 'Нет связи с сервером. Проверь интернет и попробуй ещё раз.';
	if (err === 'httpError') return 'Сервер вернул ошибку. Подожди и попробуй ещё раз.';
	return `Ошибка: ${err}`;
}
