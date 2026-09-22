import {Show, splitProps} from 'solid-js';
import type {JSX} from 'solid-js';

/**
 * Единый набор глифов интерфейса. Заменяет 10 каменных медальонов btn-*.png
 * (43 КБ на иконку, размыты на любом DPR кроме одного) — DESIGN.md §7.
 *
 * Все глифы нарисованы на сетке 24×24, центр 12,12, одна толщина штриха.
 * Это геометрия, а не иллюстрация: круги, дуги, шевроны, многоугольники.
 * Рисованные ассеты мира (/icons/*.png — топливо, часы, монеты, трофей) сюда
 * не переезжают: они принадлежат слою мира и нарисованы пером.
 */

type Glyph = {
	/** Штриховая часть: обводка текущим цветом, без заливки. */
	stroke?: string;
	/** Заливочная часть: сплошная заливка текущим цветом. */
	fill?: string;
	/** Толщина штриха, если отличается от базовой 2.4. */
	width?: number;
	/** evenodd нужен путям с отверстием (шестерня). */
	evenodd?: boolean;
};

export const GLYPHS = {
	close: {stroke: 'M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5'},
	left: {stroke: 'M14.5 5.5 L8 12 L14.5 18.5'},
	right: {stroke: 'M9.5 5.5 L16 12 L9.5 18.5'},
	plus: {stroke: 'M12 5.5 V18.5 M5.5 12 H18.5'},
	minus: {stroke: 'M5.5 12 H18.5'},
	pause: {stroke: 'M9 5.5 V18.5 M15 5.5 V18.5', width: 3},
	play: {fill: 'M9.2 5.9 L18.6 12 L9.2 18.1 Z'},
	check: {stroke: 'M5.5 12.4 L10 16.9 L18.5 7.1'},
	/** Дуга 300° с разрывом сверху и шевронным наконечником по касательной. */
	replay: {stroke: 'M16.5 6.64 A7 7 0 1 1 9.61 5.42 M15.57 3.16 L16.5 6.64 L12.91 6.33'},
	/** Тяга: двойной шеврон вверх. */
	boost: {stroke: 'M6 13.2 L12 7.2 L18 13.2 M6 18.6 L12 12.6 L18 18.6'},
	soundOn: {
		fill: 'M4.5 9.5 H7.8 L12 5.6 V18.4 L7.8 14.5 H4.5 Z',
		stroke: 'M15.4 9.3 A4 4 0 0 1 15.4 14.7 M18.1 6.7 A7.6 7.6 0 0 1 18.1 17.3',
		width: 2,
	},
	soundOff: {
		fill: 'M4.5 9.5 H7.8 L12 5.6 V18.4 L7.8 14.5 H4.5 Z',
		stroke: 'M15.4 9.6 L20.4 14.6 M20.4 9.6 L15.4 14.6',
		width: 2.2,
	},
	/** Восьмизубая шестерня с отверстием. Сгенерирована по сетке, не срисована. */
	cog: {
		fill:
			'M10.34 1.53 L13.66 1.53 L13.84 4.32 L16.13 5.26 L18.23 3.42 L20.58 5.77 L18.74 7.87 L19.68 10.16 ' +
			'L22.47 10.34 L22.47 13.66 L19.68 13.84 L18.74 16.13 L20.58 18.23 L18.23 20.58 L16.13 18.74 ' +
			'L13.84 19.68 L13.66 22.47 L10.34 22.47 L10.16 19.68 L7.87 18.74 L5.77 20.58 L3.42 18.23 ' +
			'L5.26 16.13 L4.32 13.84 L1.53 13.66 L1.53 10.34 L4.32 10.16 L5.26 7.87 L3.42 5.77 L5.77 3.42 ' +
			'L7.87 5.26 L10.16 4.32 Z M12 8.5 A3.5 3.5 0 1 0 12 15.5 A3.5 3.5 0 1 0 12 8.5 Z',
		evenodd: true,
	},
	star: {
		fill: 'M12 1.8 L14.53 8.52 L21.7 8.85 L16.09 13.33 L18 20.25 L12 16.3 L6 20.25 L7.91 13.33 L2.3 8.85 L9.47 8.52 Z',
	},
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;

export function Icon(props: {name: IconName; size?: number | string; class?: string}): JSX.Element {
	const g = (): Glyph => GLYPHS[props.name];
	const size = (): number | string => props.size ?? '1em';

	return (
		<svg class={props.class} width={size()} height={size()} viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<Show when={g().fill}>
				{(d) => <path d={d()} fill="currentColor" fill-rule={g().evenodd ? 'evenodd' : 'nonzero'} />}
			</Show>
			<Show when={g().stroke}>
				{(d) => (
					<path
						d={d()}
						stroke="currentColor"
						stroke-width={g().width ?? 2.4}
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				)}
			</Show>
		</svg>
	);
}

/**
 * Круглая кнопка интерфейса: крашеная жесть с бумажной наклейкой, не резной
 * камень. Радиус — круг (один из трёх разрешённых, DESIGN.md §7).
 */
export function RoundBtn(
	props: {
		icon: IconName;
		label: string;
		onClick?: (e: MouseEvent) => void;
		onPointerDown?: (e: PointerEvent) => void;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		tone?: 'paper' | 'goal' | 'danger';
		disabled?: boolean;
		class?: string;
	} & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>,
): JSX.Element {
	const [local, rest] = splitProps(props, ['icon', 'label', 'size', 'tone', 'class', 'disabled']);

	return (
		<button
			type="button"
			class={`rbtn rbtn-${local.size ?? 'md'} rbtn-${local.tone ?? 'paper'} ${local.class ?? ''}`}
			aria-label={local.label}
			disabled={local.disabled}
			{...rest}
		>
			<Icon name={local.icon} />
		</button>
	);
}
