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
							<i class="fa fa-music" style={{'margin-right': '6px'}}></i>
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
							<i class="fa fa-volume-up" style={{'margin-right': '6px'}}></i>
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
			</div>
		</div>
	);
}
