import {getSelectedSkinId, getSkinById} from '../stores/skin';
import {useLiveFuel} from '../stores/fuel';


/**
 * MainMenu — стартовый экран: логотип и крутящаяся кнопка Play.
 * Иконка шестерёнки → Settings; иконка-корабль → Shop (выбор скина).
 */
export function MainMenu(props: {onPlay: () => void; onSettings: () => void; onShop: () => void}) {
	const shipSrc = (): string => getSkinById(getSelectedSkinId()).src;
	const liveFuel = useLiveFuel();
	const fuelK = () => (liveFuel() / 1000).toFixed(2);
	return (
		<div class="mm-root">
			<div class="mm-top">
				<img class="mm-shop pressable" src={shipSrc()} alt="Shop" onClick={props.onShop} />
				<div class="panel">
					<i class="fa fa-tint" style={{'margin-right': '6px'}}></i>
					{fuelK()}
				</div>
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
