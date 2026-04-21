import {createSignal, Show} from 'solid-js';
import {useAuth} from '../stores/auth';
import {FAKE_PASSWORD, IS_DEV} from '../config';


export function LoginScreen() {
	const auth = useAuth();
	const [tgId, setTgId] = createSignal('468311941');

	const tg = typeof window !== 'undefined'
		? (window as unknown as {Telegram?: {WebApp?: {initData?: string}}}).Telegram?.WebApp
		: undefined;
	const initData = tg?.initData ?? '';

	const tryTelegram = () => {
		if (!initData) return;
		void auth().loginTelegram(initData);
	};

	const tryFake = (e: Event) => {
		e.preventDefault();
		void auth().loginFake(tgId().trim(), FAKE_PASSWORD);
	};

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
								disabled={auth().status === 'loading'}
							>
								{auth().status === 'loading' ? 'LOADING' : 'ENTER'}
							</button>
						</form>
					</Show>
				}>
					<button class="login-btn pressable" onClick={tryTelegram} disabled={auth().status === 'loading'}>
						PLAY
					</button>
				</Show>

				<Show when={auth().error}>
					<div class="login-error">ERROR: {auth().error}</div>
				</Show>
			</div>
		</div>
	);
}
