/**
 * Вторая часть сборки дизайн-системы: разделы, появившиеся после первой
 * публикации — иконки HUD, свет, декор, обновлённое движение и карточка
 * испытания дня.
 */
import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'game') + '/';
const OUT = process.env['DS_OUT'] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'out', 'project');

const w = (p, body) => {
	const full = join(OUT, p);
	mkdirSync(dirname(full), {recursive: true});
	writeFileSync(full, body, 'utf8');
};

function inlineSvg(rel, size) {
	const raw = readFileSync(REPO + 'public/' + rel, 'utf8');
	const m = /<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>/.exec(raw);
	return `<svg width="${size}" height="${size}" viewBox="${m[1]}" aria-hidden="true">${m[2].trim()}</svg>`;
}

const head = (group, height, subtitle) =>
	`<!-- @dsCard group="${group}" height=${height}${subtitle ? ` subtitle="${subtitle}"` : ''} -->`;

const BASE = `
<style>
	.k { font-family: var(--font-ui, system-ui, sans-serif); color: var(--ink-inv); padding: 20px; }
	.k-row { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; }
	.k-cell { display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.k-cap { font-size: 11px; color: var(--ink-inv-soft); letter-spacing: 0.02em; text-align: center; line-height: 1.35; }
	.k-note { font-size: 13px; color: var(--ink-inv-soft); line-height: 1.5; margin: 0 0 16px; max-width: 62ch; }
</style>`;

/* ------------------------------------------------------- иконки HUD --- */

/** Роль иконки читается из её же заливки: цвет здесь и есть смысл. */
const ROLE_OF = {
	'#c39c50': ['Приборы и настройки', 'латунь: то, чем игрок пользуется'],
	'#ffd24a': ['Награды и цели', 'золото: то, к чему игрок стремится'],
	'#ff5324': ['Угрозы', 'оранжевый: то, что его убьёт'],
	'#b4ab9b': ['Нейтральное', 'сталь: то, что просто есть'],
};

const hudFiles = readdirSync(`${REPO}public/icons`).filter((f) => f.endsWith('.svg'));
const byRole = {};
for (const f of hudFiles) {
	const raw = readFileSync(`${REPO}public/icons/${f}`, 'utf8');
	const tone = (/fill="(#[0-9a-f]{6})"/i.exec(raw) ?? [])[1] ?? '#b4ab9b';
	(byRole[tone] = byRole[tone] ?? []).push(f.replace('.svg', ''));
}

const label = (n) =>
	n
		.replace(/-icon$/, '')
		.replace(/^icon-/, '')
		.replace(/^ach-/, '★ ')
		.replace(/^deco-/, '');

w(
	'components/HudIcons/preview.html',
	`${head('Компоненты', 460, `${hudFiles.length} иконок, цвет по роли`)}
<div class="k">${BASE}
	<p class="k-note">Силуэты с game-icons.net под лицензией CC BY 3.0, перекрашенные в палитру проекта. Первый закон системы, перовой контур и два тона, на них намеренно не распространяется: на 24 пикселях второй тон не виден, а лишняя обводка съедает форму.</p>
	${Object.entries(ROLE_OF)
		.filter(([tone]) => byRole[tone])
		.map(
			([tone, [title, why]]) => `<div style="margin-bottom:20px">
		<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px">
			<span style="font-size:14px;font-weight:700;color:${tone}">${title}</span>
			<span style="font-size:12px;color:var(--ink-inv-soft)">${why}</span>
		</div>
		<div class="k-row" style="gap:16px">
			${byRole[tone]
				.map(
					(n) =>
						`<div class="k-cell" style="width:86px"><div style="background:var(--rock-900);border:2px solid var(--rock-line);border-radius:2px;width:54px;height:54px;display:flex;align-items:center;justify-content:center">${inlineSvg(`icons/${n}.svg`, 38)}</div><span class="k-cap">${label(n)}</span></div>`,
				)
				.join('')}
		</div>
	</div>`,
		)
		.join('')}
	<p class="k-note">Два правила отсева. Никакого текста внутри иконки: он не переводится и ломается везде, кроме английского. Никакой двусмысленности на мелком размере: проверка простая, уменьшить до 24 px и спросить, что это.</p>
</div>`,
);

w(
	'components/HudIcons/README.md',
	`Иконки HUD: сплошные силуэты, один цвет по роли.

Источник — [game-icons.net](https://game-icons.net), лицензия CC BY 3.0. Исходники вендорены в репозиторий вместе с текстом лицензии, сборка не ходит в сеть. Атрибуция выведена в экран настроек игры: это обязательство лицензии, и увидеть его должен игрок, а не разработчик.

## Поправка к первому закону

Перовой контур и двухтоновая заливка на иконки HUD **не распространяются**. Это поправка, а не обход:

- на 24 пикселях второй тон не виден, а лишняя обводка съедает форму;
- у исходников внутренняя деталь сделана негативным пространством: обручи бочки и риски циферблата это дырки, и обводка превращает их в кашу;
- прецедент был — глифы \`Icon.tsx\` одноцветные с самого начала, набор \`/icons/*\` оставался единственным, что выбивалось.

Двухтоновый закон зарабатывает своё место на объектах мира, где размер большой и важен материал.

## Цвет решает роль

| Тон | Роль |
|---|---|
| латунь \`#c39c50\` | прибор, настройка, механизм |
| золото \`--goal\` | награда, цель, подсказка действия |
| \`--danger\` | угроза |
| сталь \`#b4ab9b\` | нейтральное: замок, чужой призрак |

## Правила отсева

- **Никакого текста внутри иконки.** Не переводится. \`stop-sign\` со словом STOP и \`weight\` с «Kg» отвергнуты по этой причине.
- **Никакой двусмысленности на мелком размере.** \`rocket-thruster\` на 24 px читался снопом, \`level-end-flag\` — столбчатой диаграммой. Оба отвергнуты.
- **Подбор по смыслу, а не по названию.** \`falling-boulder\` вместо просто камня, потому что камень в игре падает.

## Что даёт потребитель

Имя файла. Размер и выравнивание задаёт контекст; цвет вшит в ассет, потому что несёт смысл и меняться не должен.`,
);

/* ------------------------------------------------------------ свет --- */

const lightCell = (glow, obj, size, title, why) => `<div class="k-cell"><div class="l-cell">
	<div class="l-glow" style="background:radial-gradient(circle at 50% 50%, ${glow})"></div>
	<div class="l-obj">${inlineSvg(obj, size)}</div>
</div><span class="k-cap"><b>${title}</b><br>${why}</span></div>`;

w(
	'components/Light/preview.html',
	`${head('Основа', 300, 'Четыре источника, все аддитивные')}
<div class="k">${BASE}
<style>
	.l-cell { position:relative; width:196px; height:148px; border:2px solid var(--rock-line); border-radius:2px; overflow:hidden; background:var(--rock-900); }
	.l-glow { position:absolute; inset:0; }
	.l-obj { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); }
</style>
	<p class="k-note">В тёмной пещере объект без собственного света висит в пустоте. Свет делает три вещи сразу: показывает, где герой, показывает, куда лететь, и превращает провал в пространство. Это и есть разница между «правильно» и «приятно».</p>
	<div class="k-row">
		${lightCell('rgba(255,190,99,0.38) 0%, rgba(255,190,99,0.10) 42%, rgba(255,190,99,0) 70%', 'ship2.svg', 62, 'Лампа корабля', 'герой несёт свой свет')}
		${lightCell('rgba(255,210,74,0.42) 0%, rgba(255,210,74,0.12) 40%, rgba(255,210,74,0) 68%', 'finish.svg', 86, 'Свечение финиша', 'цель видна раньше формы')}
		${lightCell('rgba(255,210,74,0.30) 0%, rgba(255,210,74,0.08) 38%, rgba(255,210,74,0) 64%', 'star.svg', 44, 'Свечение звезды', 'маршрут планируется заранее')}
		${lightCell('rgba(255,83,36,0.50) 0%, rgba(255,83,36,0.14) 36%, rgba(255,83,36,0) 62%', 'enemies/mine/mine.svg', 48, 'Жар мины', 'механика стала видимой')}
	</div>
	<p class="k-note" style="margin-top:18px">Свечение мины растёт быстрее её нагрева. Это не украшение: тревога должна опережать опасность, иначе подсказка приходит уже после того, как поздно.</p>
</div>`,
);

w(
	'components/Light/README.md',
	`Свет. Четыре источника, все в аддитивном режиме.

| Источник | Что делает |
|---|---|
| лампа корабля | герой несёт свой свет; пространство вылепляется вокруг него |
| свечение финиша | свет разносится дальше силуэта: цель видна раньше, чем читается форма |
| свечение звезды | маршрут планируется заранее, а не по факту появления в кадре |
| жар мины | по радиусу детекции; механика нагрева становится видимой |

## Правила

- **Режим аддитивный.** Свет складывается с тем, что под ним, а не закрашивает это.
- **Радиальный градиент здесь не нарушает первый закон.** Запрет на градиенты относится к объектам; свет объектом не является — он ровно то, чем градиент и должен быть.
- **Тон насыщеннее, чем кажется нужным.** Аддитивный свет на тёмном быстро уходит в белый, и бледно-кремовый превращается в белое пятно, спорящее с корпусом. Янтарь остаётся янтарём даже в клиппинге.
- **Свет не делает объект ярче объекта.** Корабль остаётся самым светлым пятном: лампа держится на альфе 0.38.
- **Тревога опережает опасность.** Свечение мины растёт быстрее её нагрева (\`heat ** 0.6\`), иначе подсказка приходит уже после того, как поздно.`,
);

/* ----------------------------------------------------------- декор --- */

const PROPS = [
	['sign-warning', 'Предупреждение'],
	['sign-danger', 'Опасность'],
	['sign-right', 'Направление'],
	['sign-happy', 'Комментарий'],
	['robot-1', 'Робот'],
	['robot-2', 'Робот'],
	['pipe-2', 'Колено'],
	['pipe-4', 'Вентиль'],
	['gear-2', 'Шестерня'],
	['ship-1', 'Остов'],
	['ship-3', 'Остов'],
	['stuff-1', 'Ящик'],
	['stuff-2', 'Бочка'],
	['debris-3', 'Обломок'],
];

w(
	'components/Props/preview.html',
	`${head('Игровые объекты', 300, 'Собран, но со всех уровней снят')}
<div class="k">${BASE}
	<p class="k-note"><b>Сейчас не используется.</b> 183 предмета сняты со всех тридцати уровней и отключены в процедурном генераторе: в тёмной пещере со светом каждый лишний силуэт спорит с миной и звездой за те сто миллисекунд, за которые игрок разбирает кадр. Ассеты остаются — вернуть предметы это правка раскладки уровней, а не перерисовка.</p>
	<div class="k-row" style="gap:14px">
		${PROPS.map(
			([f, n]) =>
				`<div class="k-cell" style="width:100px"><div style="background:var(--rock-900);border:2px solid var(--rock-line);border-radius:2px;width:82px;height:82px;display:flex;align-items:center;justify-content:center">${inlineSvg(`deco/static/${f}.svg`, 68)}</div><span class="k-cap">${n}</span></div>`,
		).join('')}
	</div>
	<p class="k-note" style="margin-top:18px">Указатели гравитации при этом на уровнях остались: это игровая разметка, а не декор — без них игрок не знает, куда его тянет.</p>
</div>`,
);

w(
	'components/Props/README.md',
	`Декор пещеры: таблички, трубы, шестерни, роботы, ящики, обломки, остовы кораблей.

**Сейчас не используется.** 183 предмета сняты со всех тридцати уровней и отключены в процедурном генераторе.

Причина: в тёмной пещере со светом каждый лишний силуэт спорит с миной и звездой за те сто миллисекунд, за которые игрок разбирает кадр. Ассеты остаются на месте — вернуть предметы это правка раскладки уровней, а не перерисовка.

Указатели гравитации на уровнях остались. Это игровая разметка, а не декор: без них игрок не знает, куда его тянет.

## Правила, если декор вернётся

- **Слой мира:** L p95 ≤ 34. Декор не имеет права быть ярче корабля — именно на этом горел прежний ледяной набор CERES.
- **Габарит менять нельзя.** Renderer масштабирует спрайт полем \`s\` от нативного размера текстуры: другой габарит сдвинет предмет на всех уровнях, где он стоит.
- **Разнообразие даёт форма, а не яркость.** Яркость — валюта, и её тратит только геймплей.`,
);

/* ------------------------------------------------ карточка испытания --- */

w(
	'components/DailyCard/preview.html',
	`${head('Компоненты', 240, 'Причина открыть игру завтра')}
<div class="k">${BASE}
<style>
	.dc { display:flex; align-items:center; gap:12px; width:360px; padding:12px 16px;
		background:var(--rock-700); border:3px solid var(--rock-line); border-radius:2px;
		box-shadow: inset 0 2px 0 rgba(242,236,224,0.07), inset 0 -3px 0 rgba(14,11,8,0.5), 0 4px 10px rgba(14,11,8,0.55);
		text-align:left; }
	.dc-body { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
	.dc-title { font-size:18px; font-weight:700; color:var(--goal); }
	.dc-sub { font-size:13px; color:var(--ink-inv-soft); font-variant-numeric:tabular-nums; }
	.dc-streak { flex-shrink:0; font-size:13px; font-weight:700; color:var(--rock-900);
		background:var(--goal); border-radius:999px; padding:4px 10px; font-variant-numeric:tabular-nums; }
</style>
	<p class="k-note">Карточка стоит над кнопкой Play намеренно. Если механику «вернись завтра» не видно до входа в кампанию, она не работает.</p>
	<div style="display:flex;flex-direction:column;gap:14px">
		<div class="dc">
			<span>${inlineSvg('icons/clock-icon.svg', 38)}</span>
			<span class="dc-body"><span class="dc-title">Испытание дня</span><span class="dc-sub">Сегодня не пройдено</span></span>
		</div>
		<div class="dc">
			<span>${inlineSvg('icons/clock-icon.svg', 38)}</span>
			<span class="dc-body"><span class="dc-title">Испытание дня</span><span class="dc-sub">Лучшее: 1:07</span></span>
			<span class="dc-streak">4 дня подряд</span>
		</div>
	</div>
	<p class="k-note" style="margin-top:18px">Серия показывается только когда она есть: ноль дней подряд это не достижение, а шум.</p>
</div>`,
);

w(
	'components/DailyCard/README.md',
	`Карточка испытания дня в главном меню.

Три состояния: не пройдено сегодня, есть результат, есть результат и серия. Серия показывается только когда она есть — ноль дней подряд это не достижение, а шум.

## Правила

- **Стоит над кнопкой Play.** Если механику «вернись завтра» не видно до входа в кампанию, она не работает.
- **Время — табличными цифрами.** Иначе рекорд дёргается при каждом обновлении.
- Заголовок золотой: испытание это цель, а не служебный пункт меню.

## Что даёт потребитель

Результат за сегодня и длину серии. Дату карточка берёт сама — по UTC, как и сам уровень.`,
);

console.log('вторая часть кита собрана');
