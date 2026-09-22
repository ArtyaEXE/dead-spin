import type {JSX} from 'solid-js';

/**
 * Логотип. Раньше это были два PNG по 135 КБ — единственное, что осталось от
 * растра в бренде, и единственное, что мылилось на ретине именно там, где
 * игрок смотрит первым делом.
 *
 * Здесь он собран вектором и живым текстом: буквы рисует Road Rage, уже
 * загруженный страницей, а не шрифт, зашитый в картинку. Отсюда два
 * следствия. Первое: логотип резок на любом экране и в любом размере, от
 * иконки до сплэша. Второе: он больше не файл — правка надписи это правка
 * строки, а не перерисовка ассета.
 *
 * Обводка букв делается через `paint-order="stroke"`: контур уходит под
 * заливку, и толстый штрих не съедает форму буквы изнутри. Это тот же перовой
 * контур, что у всех остальных объектов мира (DESIGN.md §3).
 */
export function Logo(props: {class?: string; title?: string}): JSX.Element {
	const title = (): string => props.title ?? 'Dead Spin';

	return (
		<svg class={props.class} viewBox="0 0 460 320" role="img" aria-label={title()}>
			<title>{title()}</title>

			{/* Вихрь за буквами: тёмный след, который держит надпись на любом фоне.
			    Форма рваная, а не эллипс — это копоть, а не виньетка. */}
			<path
				d="M230 14C330 14 424 52 440 118C456 184 392 244 300 258C208 272 96 262 42 214C-12 166 18 76 106 40C146 24 180 14 230 14Z"
				fill="#1a1410"
				opacity="0.92"
			/>
			<path
				d="M230 14C330 14 424 52 440 118C456 184 392 244 300 258C208 272 96 262 42 214C-12 166 18 76 106 40C146 24 180 14 230 14Z"
				fill="none"
				stroke="#12100e"
				stroke-width="6"
			/>

			{/* Слово. Заливка золотом цели: логотип — это приглашение, а не угроза. */}
			<text
				x="230"
				y="118"
				text-anchor="middle"
				font-family="'Road Rage', sans-serif"
				font-size="104"
				fill="#ffd24a"
				stroke="#12100e"
				stroke-width="9"
				paint-order="stroke"
				letter-spacing="2"
			>
				DEAD
			</text>
			<text
				x="230"
				y="206"
				text-anchor="middle"
				font-family="'Road Rage', sans-serif"
				font-size="104"
				fill="#ffd24a"
				stroke="#12100e"
				stroke-width="9"
				paint-order="stroke"
				letter-spacing="2"
			>
				SPIN
			</text>

			{/* Лента с подписью. Она несёт шутку, ради которой всё и затевалось. */}
			<path
				d="M28 232L432 232L446 298L14 298Z"
				fill="#e6dcc6"
				stroke="#12100e"
				stroke-width="7"
				stroke-linejoin="round"
			/>
			<path d="M28 232L432 232L434 246L26 246Z" fill="#a8987a" opacity="0.5" />
			<text
				x="230"
				y="280"
				text-anchor="middle"
				font-family="'Rubik', system-ui, sans-serif"
				font-weight="700"
				font-size="34"
				fill="#1b1611"
				textLength="384"
				lengthAdjust="spacingAndGlyphs"
			>
				THRUST ME, I&apos;M A PILOT
			</text>
		</svg>
	);
}
