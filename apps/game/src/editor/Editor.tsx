import {createSignal, onMount, Show} from 'solid-js';
import type {Level} from '@dead-spin/shared';
import {api} from '../net/client';
import {GameScreen} from '../ui/GameScreen';
import {EditorCanvas} from './EditorCanvas';
import {EditorPanel} from './EditorPanel';
import {buildLevel} from './store';


/**
 * Редактор уровней (модер-инструмент). Изолированный модуль, gated по
 * editor_admins. Layout: панель слева + Pixi-канвас справа.
 *
 * Playtest монтирует GameScreen с собранным уровнем (levelOverride +
 * noSave) — играем без сейва прогресса/fuel, по выходу назад в редактор.
 */
export function Editor(props: {onExit: () => void}) {
	const [access, setAccess] = createSignal<'checking' | 'ok' | 'denied'>('checking');
	const [playtest, setPlaytest] = createSignal<Level | null>(null);

	onMount(() => {
		void api.editorAccess()
			.then((r) => setAccess(r.isEditor ? 'ok' : 'denied'))
			.catch(() => setAccess('denied'));
	});

	const startPlaytest = (): void => {
		try {
			setPlaytest(buildLevel());
		} catch (e) {
			alert('✗ Не собрать уровень: ' + (e instanceof Error ? e.message : String(e)));
		}
	};

	return (
		<Show when={access() === 'ok'} fallback={
			<div class="ed-gate">
				<Show when={access() === 'checking'} fallback={<div>Доступ к редактору закрыт.</div>}>
					<div>Проверка доступа…</div>
				</Show>
				<button class="ed-btn" onClick={props.onExit}>← Назад</button>
			</div>
		}>
			<Show
				when={playtest()}
				fallback={
					<div class="ed-root">
						<EditorPanel onPlaytest={startPlaytest} onExit={props.onExit} />
						<EditorCanvas />
					</div>
				}
			>
				{(lvl) => (
					<GameScreen
						levelNumber={lvl().name ? Number(lvl().name) : 0}
						levelOverride={lvl()}
						noSave
						onExit={() => setPlaytest(null)}
						onSwitchLevel={() => setPlaytest(null)}
					/>
				)}
			</Show>
		</Show>
	);
}
