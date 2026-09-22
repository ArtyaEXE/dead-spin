/**
 * Третья часть: правит разделы, которые разошлись с игрой — движение,
 * бренд-книгу, токены и описание глифов интерфейса.
 */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const OUT = process.env['DS_OUT'] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'out', 'project');

const w = (p, body) => {
	const full = join(OUT, p);
	mkdirSync(dirname(full), {recursive: true});
	writeFileSync(full, body, 'utf8');
};

/* ---------------------------------------------------------- токены --- */

const tokens = JSON.parse(readFileSync(join(OUT, 'tokens.json'), 'utf8'));
if (!tokens.color.tokens.some((t) => t.name === 'scrim')) {
	tokens.color.tokens.push(
		{
			name: 'scrim',
			value: '#0e0b08b8',
			usage: 'Подложка оверлея: экран результата, ачивки, испытание дня. Тонирована в тёплое, как и всё в проекте.',
		},
		{
			name: 'scrim-soft',
			value: '#0e0b0873',
			usage: 'Лёгкое затемнение под всплывающей подсказкой, когда сцену под ней нужно оставить читаемой.',
		},
	);
	writeFileSync(join(OUT, 'tokens.json'), `${JSON.stringify(tokens, null, '\t')}\n`, 'utf8');
}

/* --------------------------------------------------------- движение --- */

const BASE = `
<style>
	.k { font-family: var(--font-ui, system-ui, sans-serif); color: var(--ink-inv); padding: 20px; }
	.k-row { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; }
	.k-cap { font-size: 11px; color: var(--ink-inv-soft); letter-spacing: 0.02em; line-height: 1.35; }
	.k-note { font-size: 13px; color: var(--ink-inv-soft); line-height: 1.5; margin: 0 0 16px; max-width: 62ch; }
</style>`;

w(
	'components/Motion/preview.html',
	`<!-- @dsCard group="Основа" height=430 subtitle="Три кривые, три длительности, два момента" -->
<div class="k">${BASE}
<style>
	.m-track { position:relative; height:32px; background:var(--rock-900); border:2px solid var(--rock-line); border-radius:2px; overflow:hidden; }
	.m-dot { position:absolute; top:6px; left:6px; width:16px; height:16px; border-radius:50%; background:var(--goal); animation: m-slide 1.6s infinite; }
	.m-1 .m-dot { animation-timing-function: cubic-bezier(0.22,1,0.36,1); }
	.m-2 .m-dot { animation-timing-function: cubic-bezier(0.65,0,0.35,1); }
	.m-3 .m-dot { animation-timing-function: cubic-bezier(0.34,1.4,0.64,1); background: var(--danger); }
	@keyframes m-slide { 0%,8% { transform: translateX(0) } 58%,100% { transform: translateX(calc(100% + 300px)) } }

	.m-screen { width:150px; height:100px; border:2px solid var(--rock-line); border-radius:2px;
		background:var(--rock-700); display:flex; align-items:center; justify-content:center;
		color:var(--ink-inv-soft); font-size:12px;
		animation: m-enter 2.6s cubic-bezier(0.22,1,0.36,1) infinite; }
	@keyframes m-enter { 0% { opacity:0; transform:scale(0.985) } 12%,80% { opacity:1; transform:scale(1) } 100% { opacity:0; transform:scale(0.985) } }

	.m-star { position:relative; width:150px; height:100px; border:2px solid var(--rock-line); border-radius:2px;
		background:var(--rock-900); overflow:hidden; }
	.m-star i { position:absolute; left:50%; top:50%; width:34px; height:34px; margin:-17px 0 0 -17px;
		background:var(--goal); clip-path: polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);
		animation: m-pop 2.2s cubic-bezier(0.22,1,0.36,1) infinite; }
	.m-star b { position:absolute; left:50%; top:50%; width:120px; height:120px; margin:-60px 0 0 -60px; border-radius:50%;
		background: radial-gradient(circle, rgba(255,210,74,0.55) 0%, rgba(255,210,74,0) 65%);
		animation: m-flare 2.2s linear infinite; }
	@keyframes m-pop { 0%,30% { transform:scale(1) translateY(0); opacity:1 } 70%,100% { transform:scale(1.9) translateY(-30px); opacity:0 } }
	@keyframes m-flare { 0%,30% { opacity:0.34; transform:scale(1) } 42% { opacity:0.96; transform:scale(1.2) } 70%,100% { opacity:0; transform:scale(1.55) } }

	@media (prefers-reduced-motion: reduce) { .m-dot, .m-screen, .m-star i, .m-star b { animation: none } }
</style>
	<p class="k-note">Интерфейс и игровой фидбек живут по разным правилам, и раньше они были перепутаны: overshoot стоял на общих оверлеях, а <code>ease-in</code> на уходе тоста — то есть тормозил ровно тот момент, на который смотрит игрок.</p>

	<div style="display:grid;gap:12px;max-width:560px">
		<div><div class="m-track m-1"><div class="m-dot"></div></div>
			<div class="k-cap" style="margin-top:5px"><b>ease-out</b> · cubic-bezier(0.22, 1, 0.36, 1) — появление и уход, по умолчанию</div></div>
		<div><div class="m-track m-2"><div class="m-dot"></div></div>
			<div class="k-cap" style="margin-top:5px"><b>ease-mid</b> · cubic-bezier(0.65, 0, 0.35, 1) — перемещение по экрану</div></div>
		<div><div class="m-track m-3"><div class="m-dot"></div></div>
			<div class="k-cap" style="margin-top:5px"><b>ease-pop</b> · cubic-bezier(0.34, 1.4, 0.64, 1) — только редкое и праздничное</div></div>
	</div>

	<div class="k-row" style="margin-top:20px;align-items:flex-start">
		<div><div class="m-screen">экран</div>
			<div class="k-cap" style="margin-top:6px;max-width:150px"><b>Смена экрана</b><br>260 мс, вход без выхода</div></div>
		<div><div class="m-star"><b></b><i></i></div>
			<div class="k-cap" style="margin-top:6px;max-width:150px"><b>Подбор звезды</b><br>420 мс, свет гаснет позже</div></div>
		<div style="display:flex;gap:22px;padding-top:8px">
			<div><div style="font-size:22px;color:var(--goal);font-variant-numeric:tabular-nums">120<span style="font-size:12px;color:var(--ink-inv-soft)"> мс</span></div><div class="k-cap">нажатие</div></div>
			<div><div style="font-size:22px;color:var(--goal);font-variant-numeric:tabular-nums">180<span style="font-size:12px;color:var(--ink-inv-soft)"> мс</span></div><div class="k-cap">панель</div></div>
			<div><div style="font-size:22px;color:var(--goal);font-variant-numeric:tabular-nums">260<span style="font-size:12px;color:var(--ink-inv-soft)"> мс</span></div><div class="k-cap">оверлей, экран</div></div>
		</div>
	</div>
</div>`,
);

w(
	'components/Motion/README.md',
	`Три кривые и три длительности. Больше в системе нет.

| Токен | Значение | Где |
|---|---|---|
| \`ease-out\` | \`cubic-bezier(0.22, 1, 0.36, 1)\` | появление и уход, по умолчанию |
| \`ease-mid\` | \`cubic-bezier(0.65, 0, 0.35, 1)\` | перемещение по экрану |
| \`ease-pop\` | \`cubic-bezier(0.34, 1.4, 0.64, 1)\` | только редкое и праздничное |
| \`t-press\` | \`120ms\` | нажатие |
| \`t-ui\` | \`180ms\` | тултип, дропдаун, смена панели |
| \`t-panel\` | \`260ms\` | оверлей, экран результата, смена экрана |

## Два авторских момента

**Смена экрана.** Раньше кадр меню сменялся кадром уровней жёсткой склейкой. Теперь вход на 260 мс: прозрачность плюс \`scale(0.985)\`. Вход, а не выход — уходящий экран не задерживает игрока, приходящий объясняет, что произошла смена. Приборные панели въезжают следом со стаггером 60 мс: сначала мир, потом обвязка.

**Подбор звезды.** Единственная награда по ходу уровня, и стоила она осознанного крюка с маршрута. Раньше звезда просто исчезала. Теперь 420 мс: разворачивается, гаснет, а световое пятно вспыхивает и догорает **позже** самой звезды — послесвечение держит момент. Это редкое событие, поэтому ему разрешено выйти за 300 мс, в отличие от интерфейса.

## Правила

- **\`ease-in\` в интерфейсе запрещён.** Он тормозит начало движения, а именно на начало смотрит пользователь.
- **Никакой анимации интерфейса дольше 300 мс.** Длинный фидбек ощущается как задержка ввода.
- **Overshoot только там, где событие редкое и его празднуют.** В кнопках и переходах — никогда: именно это читается как дешёвый шаблон.
- **Появление не начинается со \`scale(0)\`.** Минимум \`0.92\`: в реальном мире ничто не возникает из ничего.
- **Анимируются только \`transform\` и \`opacity\`.** Остальное вызывает layout и роняет кадры на слабом телефоне.
- **Переходы, а не keyframes,** для всего, что может прерваться: keyframes перезапускаются с нуля, transition доигрывает от текущей точки.
- \`prefers-reduced-motion\` убирает движение по позиции и оставляет прозрачность: пользователь всё ещё видит, что произошло. Тряска экрана при взрыве отключается первой.

## Частотное правило

Действие, которое игрок делает десятки раз за сессию — рестарт, пауза, зум — анимируется минимально или не анимируется вовсе. Редкое и праздничное — первая победа, новый скин, дейлик — получает характер. «Выглядит круто» на часто повторяемом элементе не является основанием.`,
);

/* ------------------------------------------- глифы против иконок HUD --- */

w(
	'components/Icons/README.md',
	`Глифы управления: крестик, шестерня, play, пауза, шевроны. Одна толщина штриха, сетка 24.

Это **не** иконки HUD. Разница намеренная и проходит по смыслу:

| | Глифы (этот раздел) | Иконки HUD |
|---|---|---|
| Что означают | действие: закрыть, играть, приблизить | предмет: топливо, монеты, мина |
| Форма | геометрия, которую можно задать точно | силуэт нарисованного объекта |
| Цвет | \`currentColor\`, наследуется от кнопки | вшит в ассет, несёт роль |
| Источник | \`src/ui/Icon.tsx\` | game-icons.net |

Шестерня и звезда здесь генерируются по сетке, а не срисовываются, поэтому зубья и лучи ровные.

## Правила

- Цвет — \`currentColor\`. Глиф красится цветом текста родителя и работает на любом тоне кнопки.
- Размер — \`1em\`. Задаётся \`font-size\` родителя, а не атрибутами.
- **Эмодзи в роли иконки запрещены.** У них нет общей толщины штриха, они разные на разных платформах и не красятся.

## Что даёт потребитель

Имя глифа. Всё остальное — размер, цвет, выравнивание — наследуется от контекста.`,
);

console.log('третья часть кита собрана');
