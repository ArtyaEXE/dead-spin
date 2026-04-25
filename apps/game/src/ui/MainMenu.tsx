import {getSelectedSkinId, getSkinById} from '../stores/skin';


/**
 * MainMenu — стартовый экран: логотип и крутящаяся кнопка Play.
 * Иконка шестерёнки → Settings; иконка-корабль → Shop (выбор скина).
 */
export function MainMenu(props: {onPlay: () => void; onSettings: () => void; onShop: () => void}) {
	const shipSrc = (): string => getSkinById(getSelectedSkinId()).src;
	return (
		<div class="mm-root">
			<div class="mm-top">
				<img class="mm-shop pressable" src={shipSrc()} alt="Shop" onClick={props.onShop} />
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
