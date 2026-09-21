import {createSignal, createEffect, onCleanup, onMount, Show} from 'solid-js';
import {useAuth, authStore} from '../stores/auth';


/**
 * Сколько мс ждём ответа сервера прежде чем показать «сервер просыпается».
 * Бесплатный тариф хостинга засыпает после простоя, холодный старт
 * занимает до минуты — 12 секунд отделяют нормальный отклик от него.
 */
const SLOW_THRESHOLD_MS = 12_000;


/**
 * Экран подключения. Логина как действия больше нет: аккаунт заводится
 * автоматически по идентификатору устройства, поэтому в норме игрок
 * видит этот экран доли секунды. Он остаётся ради двух случаев — нет
 * сети и холодный старт сервера.
 */
export function LoginScreen() {
	const auth = useAuth();
	const [showSlowHint, setShowSlowHint] = createSignal(false);

	onMount(() => {
		if (authStore.getState().status === 'idle') void authStore.getState().login();
	});

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

	const isLoading = () => auth().status === 'loading';
	const isError = () => auth().status === 'error';

	return (
		<div class="login-root">
			<div class="login-card">
				<img class="login-logo" src="/dead-spin-logo-shadow.png" alt="Dead Spin" />

				<Show when={isError()}>
					<button class="login-btn pressable" onClick={() => void auth().login()}>
						RETRY
					</button>
					<div class="login-error">{authErrorText(auth().error)}</div>
				</Show>

				<Show when={isLoading() && showSlowHint()}>
					<div class="login-hint">
						Сервер просыпается, это займёт до минуты.<br/>
						Если зависло — нажми ещё раз.
					</div>
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
