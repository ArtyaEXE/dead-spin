import {createStore} from 'zustand/vanilla';
import {generateWallPolygon, generateLevel, type LevelSpec, type GenPoint} from '@dead-spin/levels/generate';
import type {Level} from '@dead-spin/shared';
import {createSolidStoreAdapter} from '../stores/solid';


/** Что сейчас выделено на канвасе для перетаскивания. */
export type Selection =
	| {kind: 'start'}
	| {kind: 'finish'}
	| {kind: 'star'; index: 0 | 1 | 2}
	| {kind: 'waypoint'; index: number}
	| {kind: 'enemy'; index: number}
	| {kind: 'decor'; index: number};


/**
 * Фоновый шаблон-«калька» для трассировки. Эфемерный: НЕ попадает в spec,
 * историю undo/redo или экспортируемый уровень — это лишь референс на канвасе.
 */
export type Template = {
	src: string;     // data-URL картинки
	x: number;       // позиция в координатах мира
	y: number;
	scale: number;   // равномерный масштаб
	opacity: number; // 0..1
	locked: boolean; // locked → не ловит события, рисуем поверх
};


export type EditorState = {
	spec: LevelSpec;
	/** Деривированный полигон стен — пересчёт при каждом изменении spec. */
	polygon: GenPoint[];
	selected: Selection | null;
	/** Фоновый шаблон для трассировки (или null). */
	template: Template | null;

	regenerate: () => void;
	patchSpec: (patch: Partial<LevelSpec>) => void;
	select: (sel: Selection | null) => void;
	loadSpec: (spec: LevelSpec) => void;
	setTemplate: (t: Template) => void;
	patchTemplate: (patch: Partial<Template>) => void;
	clearTemplate: () => void;
};


/** Стартовый spec — простой синусоидальный коридор. */
export function defaultSpec(): LevelSpec {
	return {
		n: 100,
		res: {x: 1600, y: 1300},
		seed: Math.floor(Math.random() * 100000),
		noiseAmps: [28, 14, 7],
		noiseScale: 0.0045,
		grid: 10,
		simplifyEps: 4,
		gravity: {x: 0, y: 0},
		mainPath: [
			{x: 250, y: 1050}, {x: 500, y: 880}, {x: 800, y: 760},
			{x: 1080, y: 600}, {x: 1350, y: 360},
		],
		mainWidths: [120, 135, 145, 130, 115],
		branches: [],
		rooms: [],
		startPoint: {x: 250, y: 1050},
		finishPoint: {x: 1350, y: 360},
		stars: [{x: 500, y: 820}, {x: 900, y: 700}, {x: 1200, y: 470}],
		enemies: [],
		decor: [],
	};
}


export const editorStore = createStore<EditorState>((set, get) => ({
	spec: defaultSpec(),
	polygon: [] as GenPoint[],
	selected: null as Selection | null,
	template: null as Template | null,

	regenerate() {
		try {
			const poly = generateWallPolygon(get().spec);
			set({polygon: poly});
		} catch (e) {
			console.warn('regenerate failed:', e instanceof Error ? e.message : e);
		}
	},

	patchSpec(patch: Partial<LevelSpec>) {
		pushHistory(get().spec);
		set({spec: {...get().spec, ...patch}});
		get().regenerate();
	},

	select(sel: Selection | null) { set({selected: sel}); },

	loadSpec(spec: LevelSpec) {
		pushHistory(get().spec);
		set({spec, selected: null});
		get().regenerate();
	},

	setTemplate(t: Template) { set({template: t}); },
	patchTemplate(patch: Partial<Template>) {
		const cur = get().template;
		if (!cur) return;
		set({template: {...cur, ...patch}});
	},
	clearTemplate() { set({template: null}); },
}));


// ─── Undo/redo — простой стек снапшотов spec ─────────────────────────
//
// zundo не подошёл: он тянет React-entry zustand'а, который в Solid-
// проекте без react не резолвится. Своя история на JSON-снапшотах spec
// проще и без зависимостей. Трекаем только spec (polygon деривирован).

const past: LevelSpec[] = [];
const future: LevelSpec[] = [];
const HISTORY_LIMIT = 100;
const clone = (s: LevelSpec): LevelSpec => JSON.parse(JSON.stringify(s)) as LevelSpec;

function pushHistory(prev: LevelSpec): void {
	past.push(clone(prev));
	if (past.length > HISTORY_LIMIT) past.shift();
	future.length = 0; // новая ветка истории — redo обнуляется
}

export function undo(): void {
	const prev = past.pop();
	if (!prev) return;
	future.push(clone(editorStore.getState().spec));
	editorStore.setState({spec: prev, selected: null});
	editorStore.getState().regenerate();
}
export function redo(): void {
	const next = future.pop();
	if (!next) return;
	past.push(clone(editorStore.getState().spec));
	editorStore.setState({spec: next, selected: null});
	editorStore.getState().regenerate();
}
export function canUndo(): boolean { return past.length > 0; }
export function canRedo(): boolean { return future.length > 0; }

/** Полная генерация + Zod-валидация. Бросает при ошибке. */
export function buildLevel(): Level {
	return generateLevel(editorStore.getState().spec);
}


export const useEditor = createSolidStoreAdapter(editorStore);
