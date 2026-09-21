import {onMount, onCleanup} from 'solid-js';
import Konva from 'konva';
import {generateWallPolygon, type GenPoint, type LevelSpec} from '@dead-spin/levels/generate';
import {editorStore, type Selection} from './store';


// ─── Палитра (в тон Pixi-рендеру игры) ───────────────────────────────
const COL = {
	bg: '#14100c',
	caveFill: '#2a2218',
	caveStroke: '#be6f41',
	path: '#4a90d9',
	waypoint: '#4a90d9',
	widthRing: '#4a90d9',
	start: '#4cafff',
	finish: '#4cff7a',
	star: '#ffd23f',
	sel: '#ffffff',
} as const;

const MIN_WIDTH = 20; // минимальная полуширина коридора при драге ручки

const clone = (s: LevelSpec): LevelSpec => JSON.parse(JSON.stringify(s)) as LevelSpec;
const flat = (poly: GenPoint[]): number[] => {
	const out: number[] = [];
	for (const p of poly) { out.push(p.x, p.y); }
	return out;
};
const enemyColor = (name: string): string =>
	name === 'mine' ? '#ff5028' : name === 'stone' ? '#9a9a9a' : '#c060d0';

/** Ближайший сегмент пути к точке мира — для вставки waypoint'а. */
function projectToPath(path: GenPoint[], w: GenPoint): {i: number; t: number} {
	let best = {i: 0, t: 0, d: Infinity};
	for (let i = 0; i < path.length - 1; i++) {
		const a = path[i]!, b = path[i + 1]!;
		const dx = b.x - a.x, dy = b.y - a.y;
		const len2 = dx * dx + dy * dy;
		let t = len2 ? ((w.x - a.x) * dx + (w.y - a.y) * dy) / len2 : 0;
		t = Math.max(0, Math.min(1, t));
		const cx = a.x + t * dx, cy = a.y + t * dy;
		const d = Math.hypot(w.x - cx, w.y - cy);
		if (d < best.d) best = {i, t, d};
	}
	return best;
}


/**
 * Канвас редактора на Konva. Stage таскается для пана, колесо — зум.
 * Маркеры (waypoints / старт / финиш / звёзды / враги) — draggable-якоря.
 *
 * Прямое манипулирование:
 *  • клик по линии пути       → вставить waypoint в этом месте;
 *  • двойной клик по waypoint → удалить (если точек > 2);
 *  • выбранный waypoint       → кольцо + ручка полуширины (mainWidths[i]).
 *
 * Пещера деривируется из spec (generateWallPolygon) и обновляется вживую
 * во время драга; коммит в стор — на dragend (одна запись в историю).
 */
export function EditorCanvas() {
	let host!: HTMLDivElement;

	onMount(() => {
		const stage = new Konva.Stage({
			container: host,
			width: host.clientWidth,
			height: host.clientHeight,
			draggable: true,
		});
		host.style.background = COL.bg;
		// bgLayer — фоновый шаблон-калька, ПОД основным слоем. Живёт отдельно,
		// чтобы пересборка editing-слоя его не трогала (картинка грузится async).
		const bgLayer = new Konva.Layer();
		stage.add(bgLayer);
		const layer = new Konva.Layer();
		stage.add(layer);

		// Подгоняем вид под размер уровня.
		const fit = (w: number, h: number): void => {
			const s = Math.min(host.clientWidth / w, host.clientHeight / h) * 0.92;
			stage.scale({x: s, y: s});
			stage.position({x: (host.clientWidth - w * s) / 2, y: (host.clientHeight - h * s) / 2});
		};
		fit(editorStore.getState().spec.res.x, editorStore.getState().spec.res.y);

		// Зум колесом вокруг курсора.
		stage.on('wheel', (e) => {
			e.evt.preventDefault();
			const old = stage.scaleX();
			const ptr = stage.getPointerPosition();
			if (!ptr) return;
			const mouseTo = {x: (ptr.x - stage.x()) / old, y: (ptr.y - stage.y()) / old};
			const next = e.evt.deltaY > 0 ? old / 1.1 : old * 1.1;
			const s = Math.max(0.05, Math.min(8, next));
			stage.scale({x: s, y: s});
			stage.position({x: ptr.x - mouseTo.x * s, y: ptr.y - mouseTo.y * s});
		});

		// ── Состояние драга ──────────────────────────────────────────
		let dragging = false;      // подавляет rebuild() пока тащим якорь
		let work: LevelSpec | null = null; // рабочая копия spec на время драга
		let caveLine: Konva.Line | null = null;
		let pathLine: Konva.Line | null = null;
		// Реестр выделяемых нод — чтобы менять подсветку БЕЗ пересборки слоя.
		const selectables: {group: Konva.Group; sel: Selection}[] = [];
		let widthGroup: Konva.Group | null = null; // кольцо + ручка полуширины

		const select = (s: Selection | null): void => editorStore.getState().select(s);

		const liveCave = (): void => {
			if (!work) return;
			try {
				caveLine?.points(flat(generateWallPolygon(work)));
				pathLine?.points(work.mainPath.flatMap((p) => [p.x, p.y]));
				layer.batchDraw();
			} catch {/* невалидная геометрия в процессе драга — пропускаем кадр */}
		};

		// ── Применение драга в рабочую копию (live) ──────────────────
		const dragLive = (sel: Selection, x: number, y: number): void => {
			if (!work) return;
			if (sel.kind === 'waypoint') { work.mainPath[sel.index] = {x, y}; liveCave(); }
		};

		// ── Коммит драга в стор (история) ────────────────────────────
		const commit = (sel: Selection, gx: number, gy: number): void => {
			const x = Math.round(gx), y = Math.round(gy);
			const st = editorStore.getState();
			const spec = st.spec;
			if (sel.kind === 'start') st.patchSpec({startPoint: {x, y}});
			else if (sel.kind === 'finish') st.patchSpec({finishPoint: {x, y}});
			else if (sel.kind === 'star') {
				const stars = [...spec.stars] as LevelSpec['stars'];
				stars[sel.index] = {x, y};
				st.patchSpec({stars});
			} else if (sel.kind === 'waypoint') {
				const mainPath = spec.mainPath.map((p, i) => i === sel.index ? {x, y} : p);
				st.patchSpec({mainPath});
			} else if (sel.kind === 'enemy') {
				const enemies = spec.enemies.map((en: Record<string, unknown>, i: number) =>
					i === sel.index ? {...en, x, y} : en);
				st.patchSpec({enemies});
			}
		};

		const sameSel = (a: Selection | null, b: Selection): boolean => {
			if (!a || a.kind !== b.kind) return false;
			if (a.kind === 'waypoint' && b.kind === 'waypoint') return a.index === b.index;
			if (a.kind === 'star' && b.kind === 'star') return a.index === b.index;
			if (a.kind === 'enemy' && b.kind === 'enemy') return a.index === b.index;
			return true; // start / finish
		};

		// Draggable-маркер (круг + подпись). Двигает соответствующую точку.
		const makeMarker = (
			p: GenPoint, color: string, label: string, sel: Selection, radius = 16,
		): Konva.Group => {
			const group = new Konva.Group({x: p.x, y: p.y, draggable: true});
			group.add(new Konva.Circle({radius, fill: color, opacity: 0.9}));
			if (label) {
				const t = new Konva.Text({text: label, fontSize: 18, fontStyle: 'bold', fill: '#fff'});
				t.offset({x: t.width() / 2, y: t.height() / 2});
				group.add(t);
			}
			// Выделение по click (не mousedown!): mousedown→select мгновенно
			// перестроил бы выделение во время начала драга. click срабатывает
			// только если драга не было, dragstart ставит выделение сам.
			group.on('click tap', () => select(sel));
			group.on('dragstart', () => { dragging = true; work = clone(editorStore.getState().spec); select(sel); });
			group.on('dragmove', () => dragLive(sel, group.x(), group.y()));
			group.on('dragend', () => { dragging = false; commit(sel, group.x(), group.y()); });
			selectables.push({group, sel});
			return group;
		};

		// ── Вставка / удаление waypoint'ов ───────────────────────────
		const insertWaypoint = (w: GenPoint): void => {
			const st = editorStore.getState();
			const spec = st.spec;
			if (spec.mainPath.length < 2) return;
			const {i, t} = projectToPath(spec.mainPath, w);
			const mainPath = [...spec.mainPath];
			mainPath.splice(i + 1, 0, {x: Math.round(w.x), y: Math.round(w.y)});
			const wA = spec.mainWidths[i] ?? 100;
			const wB = spec.mainWidths[i + 1] ?? wA;
			const mainWidths = [...spec.mainWidths];
			mainWidths.splice(i + 1, 0, Math.round(wA + (wB - wA) * t));
			st.patchSpec({mainPath, mainWidths});
			st.select({kind: 'waypoint', index: i + 1});
		};

		const deleteWaypoint = (index: number): void => {
			const st = editorStore.getState();
			const spec = st.spec;
			if (spec.mainPath.length <= 2) return;
			const mainPath = spec.mainPath.filter((_, i) => i !== index);
			const mainWidths = spec.mainWidths.filter((_, i) => i !== index);
			st.patchSpec({mainPath, mainWidths});
			st.select(null);
		};

		// ── Подсветка выделения — без пересборки интерактивных нод ────
		// Меняем только обводку кружков + кольцо/ручку ширины. Иначе клик
		// по ноде уничтожал бы её до старта драга / до dblclick-удаления.
		const applySelection = (): void => {
			if (dragging) return;
			const {spec, selected} = editorStore.getState();
			for (const {group, sel} of selectables) {
				const c = group.findOne('Circle') as Konva.Circle | undefined;
				if (!c) continue;
				const on = sameSel(selected, sel);
				c.stroke(on ? COL.sel : '');
				c.strokeWidth(on ? (sel.kind === 'waypoint' ? 2.5 : 3) : 0);
			}

			widthGroup?.destroy();
			widthGroup = null;
			if (selected?.kind === 'waypoint') {
				const idx = selected.index;
				const wp = spec.mainPath[idx];
				const half = spec.mainWidths[idx] ?? 100;
				if (wp) {
					widthGroup = new Konva.Group();
					widthGroup.add(new Konva.Circle({
						x: wp.x, y: wp.y, radius: half,
						stroke: COL.widthRing, strokeWidth: 1.5, dash: [8, 6],
						opacity: 0.7, strokeScaleEnabled: false, listening: false,
					}));
					const handle = new Konva.Circle({
						x: wp.x + half, y: wp.y, radius: 9,
						fill: COL.widthRing, stroke: COL.sel, strokeWidth: 1.5, draggable: true,
					});
					handle.on('dragstart', () => { dragging = true; work = clone(editorStore.getState().spec); });
					handle.on('dragmove', () => {
						if (!work) return;
						const d = Math.max(MIN_WIDTH, Math.hypot(handle.x() - wp.x, handle.y() - wp.y));
						work.mainWidths[idx] = Math.round(d);
						liveCave();
					});
					handle.on('dragend', () => {
						dragging = false;
						const d = Math.max(MIN_WIDTH, Math.hypot(handle.x() - wp.x, handle.y() - wp.y));
						const mainWidths = [...editorStore.getState().spec.mainWidths];
						mainWidths[idx] = Math.round(d);
						editorStore.getState().patchSpec({mainWidths});
					});
					widthGroup.add(handle);
					layer.add(widthGroup);
				}
			}
			layer.batchDraw();
		};

		// ── Полная перерисовка слоя из стора (только при смене spec) ──
		const rebuild = (): void => {
			if (dragging) return;
			layer.destroyChildren();
			selectables.length = 0;
			widthGroup = null;
			const {spec, polygon} = editorStore.getState();

			caveLine = new Konva.Line({
				points: flat(polygon), closed: true,
				fill: COL.caveFill, stroke: COL.caveStroke, strokeWidth: 3,
				strokeScaleEnabled: false, listening: false,
			});
			layer.add(caveLine);

			// Осевая линия — кликабельна для вставки точек.
			pathLine = new Konva.Line({
				points: spec.mainPath.flatMap((p) => [p.x, p.y]),
				stroke: COL.path, strokeWidth: 2, opacity: 0.6,
				strokeScaleEnabled: false, hitStrokeWidth: 16,
			});
			pathLine.on('click tap', () => {
				const w = stage.getRelativePointerPosition();
				if (w) insertWaypoint(w);
			});
			pathLine.on('mouseenter', () => { stage.container().style.cursor = 'copy'; });
			pathLine.on('mouseleave', () => { stage.container().style.cursor = 'default'; });
			layer.add(pathLine);

			// Waypoints (поверх линии).
			spec.mainPath.forEach((p, i) => {
				const g = new Konva.Group({x: p.x, y: p.y, draggable: true});
				g.add(new Konva.Circle({radius: 11, fill: COL.waypoint, opacity: 0.85}));
				const sel: Selection = {kind: 'waypoint', index: i};
				g.on('click tap', () => select(sel));
				g.on('dragstart', () => { dragging = true; work = clone(editorStore.getState().spec); select(sel); });
				g.on('dragmove', () => dragLive(sel, g.x(), g.y()));
				g.on('dragend', () => { dragging = false; commit(sel, g.x(), g.y()); });
				g.on('dblclick dbltap', () => deleteWaypoint(i));
				selectables.push({group: g, sel});
				layer.add(g);
			});

			// Ключевые точки.
			layer.add(makeMarker(spec.startPoint, COL.start, '▶', {kind: 'start'}));
			layer.add(makeMarker(spec.finishPoint, COL.finish, '⚑', {kind: 'finish'}));
			spec.stars.forEach((s, i) => {
				layer.add(makeMarker(s, COL.star, `${i + 1}`, {kind: 'star', index: i as 0 | 1 | 2}, 14));
			});

			// Враги.
			spec.enemies.forEach((en: {name: string; x: number; y: number}, i: number) => {
				layer.add(makeMarker(
					{x: en.x, y: en.y}, enemyColor(en.name), en.name[0]!.toUpperCase(),
					{kind: 'enemy', index: i},
				));
			});

			applySelection();
			layer.draw();
		};

		// Клик по пустому месту — снять выделение.
		stage.on('click tap', (e) => {
			if (e.target === stage) editorStore.getState().select(null);
		});

		// ── Фоновый шаблон-калька ────────────────────────────────────
		let tImage: Konva.Image | null = null;
		let loadedSrc: string | null = null;

		const applyTemplateProps = (t: import('./store').Template): void => {
			if (!tImage) return;
			tImage.position({x: t.x, y: t.y});
			tImage.scale({x: t.scale, y: t.scale});
			tImage.opacity(t.opacity);
			tImage.draggable(!t.locked);
			tImage.listening(!t.locked);
		};

		const syncTemplate = (): void => {
			const t = editorStore.getState().template;
			if (!t) {
				tImage?.destroy(); tImage = null; loadedSrc = null;
				bgLayer.draw();
				return;
			}
			if (t.src !== loadedSrc) {
				loadedSrc = t.src;
				const el = new Image();
				el.onload = () => {
					const cur = editorStore.getState().template;
					if (!cur || cur.src !== t.src) return; // шаблон сменился за время загрузки
					tImage?.destroy();
					tImage = new Konva.Image({image: el});
					tImage.on('dragend', () => {
						editorStore.getState().patchTemplate({
							x: Math.round(tImage!.x()), y: Math.round(tImage!.y()),
						});
					});
					bgLayer.add(tImage);
					applyTemplateProps(cur);
					bgLayer.draw();
				};
				el.src = t.src;
				return;
			}
			applyTemplateProps(t);
			bgLayer.draw();
		};

		editorStore.getState().regenerate();
		rebuild();
		syncTemplate();
		// Пересобираем слой только при смене геометрии (spec/polygon).
		// Смена выделения — лёгкий applySelection без уничтожения нод.
		// Смена template — отдельный syncTemplate (геометрию не трогает).
		let lastSpec = editorStore.getState().spec;
		let lastPoly = editorStore.getState().polygon;
		let lastTemplate = editorStore.getState().template;
		const unsub = editorStore.subscribe(() => {
			const st = editorStore.getState();
			if (st.spec !== lastSpec || st.polygon !== lastPoly) {
				lastSpec = st.spec; lastPoly = st.polygon;
				rebuild();
			} else {
				applySelection();
			}
			if (st.template !== lastTemplate) {
				lastTemplate = st.template;
				syncTemplate();
			}
		});

		const ro = new ResizeObserver(() => {
			stage.width(host.clientWidth);
			stage.height(host.clientHeight);
		});
		ro.observe(host);

		onCleanup(() => {
			unsub();
			ro.disconnect();
			stage.destroy();
		});
	});

	return <div class="editor-canvas" ref={host} />;
}
