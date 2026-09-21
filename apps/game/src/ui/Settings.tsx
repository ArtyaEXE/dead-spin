import {For} from 'solid-js';
import {audioStore, useAudio} from '../stores/audio';
import {LOCALES, getLocale, setLocale, t} from '../i18n';


/**
 * Экран настроек: громкость музыки и эффектов, язык интерфейса, версия,
 * ссылка на политику конфиденциальности.
 */
export function Settings(props: {onBack: () => void}) {
	const a = useAudio();
	const s = audioStore.getState();

	return (
		<div class="settings-root">
			<div class="levels-top">
				<img class="pressable" src="/btn-close.png" style={{height: '60px'}} alt="Back" onClick={props.onBack} />
				<div class="world-title">{t('settings.title')}</div>
				<div style={{width: '60px'}} />
			</div>

			<div class="settings-center">
				<div class="settings-panel">
					<div class="section-title">{t('settings.sound')}</div>

					<div class="setting-row">
						<div class="setting-display">
							<img class="icon-inline" src="/icons/music-icon.png" alt="" />
							{t('settings.music')}
						</div>
						<input
							type="range"
							class="volume-slider"
							min="0" max="1" step="0.05"
							value={a().musicVolume}
							onInput={(e) => s.setMusicVolume(Number(e.currentTarget.value))}
						/>
					</div>

					<div class="setting-row">
						<div class="setting-display">
							<img class="icon-inline" src="/icons/sound-icon.png" alt="" />
							{t('settings.effects')}
						</div>
						<input
							type="range"
							class="volume-slider"
							min="0" max="1" step="0.05"
							value={a().sfxVolume}
							onInput={(e) => s.setSfxVolume(Number(e.currentTarget.value))}
						/>
					</div>
				</div>

				<div class="settings-panel">
					<div class="section-title">{t('settings.language')}</div>
					<div class="setting-row lang-row">
						<For each={LOCALES}>
							{(l) => (
								<button
									class="lang-btn pressable"
									classList={{active: getLocale() === l}}
									onClick={() => setLocale(l)}
								>{l.toUpperCase()}</button>
							)}
						</For>
					</div>
				</div>

				<div class="settings-meta">
					<div class="settings-version">{t('settings.build')} {__APP_VERSION__}</div>
					<a class="settings-link" href="/privacy.html" target="_blank" rel="noreferrer">{t('settings.privacy')}</a>
				</div>
			</div>
		</div>
	);
}
