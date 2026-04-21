/**
 * MainMenu — стартовый экран: логотип и крутящаяся кнопка Play.
 * Иконка шестерёнки открывает Settings (озвучка).
 */
export function MainMenu(props: {onPlay: () => void; onSettings: () => void}) {
	return (
		<div class="mm-root">
			<div class="mm-top">
				<img class="mm-cog pressable" src="/btn-cog.png" alt="Settings" onClick={props.onSettings} />
			</div>

			<img class="mm-logo" src="/dead-spin-logo-shadow.png" alt="Dead Spin" />

			<div class="mm-play pressable" onClick={props.onPlay}>
				<img src="/btn-play.png" alt="Play" />
			</div>

			<div class="mm-footer"></div>
		</div>
	);
}
