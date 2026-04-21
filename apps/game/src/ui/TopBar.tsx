import {For} from 'solid-js';


function printTimer(ms: number, withMs: boolean = false): string {
	const totalSec = ms / 1000;
	const min = Math.floor(totalSec / 60);
	const sec = totalSec - min * 60;
	if (withMs) return `${min}:${sec.toFixed(1).padStart(4, '0')}`;
	return `${min}:${Math.floor(sec).toString().padStart(2, '0')}`;
}


export function TopBar(props: {fuel: number; time: number; stars: number}) {
	const stars = () => Array.from({length: props.stars}, (_, i) => i + 1);

	return (
		<div class="topbar">
			<div class="panel">
				<span classList={{'low-fuel': props.fuel < 2000}}>
					<i class="fa fa-tint" style={{'margin-right': '6px'}}></i>
					{(props.fuel / 1000).toFixed(2)}
				</span>
			</div>

			<div class="panel">
				<i class="fa fa-clock-o" style={{'margin-right': '6px'}}></i>
				{printTimer(Math.floor(props.time / 1000) * 1000)}
			</div>

			<div class="topbar-stars">
				<For each={stars()}>
					{(n) => <img src="/star.png" style={{'animation-delay': `${(n - 1) * 80}ms`}} alt="" />}
				</For>
			</div>
		</div>
	);
}
