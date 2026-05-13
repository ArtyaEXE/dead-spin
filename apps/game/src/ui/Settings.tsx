import {audioStore, useAudio} from '../stores/audio';


/**
 * Экран настроек — два ползунка для Music и SFX громкости.
 * Повторяет [Settings.svelte](space/imports/ui/main-menu/Settings.svelte).
 */
export function Settings(props: {onBack: () => void}) {
	const a = useAudio();
	const s = audioStore.getState();

	return (
		<div class="settings-root">
			<div class="levels-top">
				<img class="pressable" src="/btn-close.png" style={{height: '60px'}} alt="Back" onClick={props.onBack} />
				<div class="world-title">SETTINGS</div>
				<div style={{width: '60px'}} />
			</div>

			<div class="settings-center">
				<div class="settings-panel">
					<div class="section-title">SOUND</div>

					<div class="setting-row">
						<div class="setting-display">
							<img class="icon-inline" src="/icons/music-icon.png" alt="" />
							Music
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
							Effects
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

				<div class="settings-meta">
					<div class="settings-version">build {__APP_VERSION__}</div>
					<a class="settings-link" href="/privacy.html" target="_blank" rel="noreferrer">Privacy</a>
				</div>
			</div>
		</div>
	);
}
