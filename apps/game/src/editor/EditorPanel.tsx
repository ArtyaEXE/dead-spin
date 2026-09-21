import {For, Show} from 'solid-js';
import {editorStore, useEditor, undo, redo, canUndo, canRedo, buildLevel} from './store';
import type {LevelSpec} from '@dead-spin/levels/generate';


/** Левая панель редактора: параметры spec, враги, undo/redo, export. */
export function EditorPanel(props: {onPlaytest: () => void; onExit: () => void}) {
	const ed = useEditor();
	const spec = (): LevelSpec => ed().spec;

	const patch = (p: Partial<LevelSpec>): void => editorStore.getState().patchSpec(p);

	const addEnemy = (name: 'mine' | 'stone' | 'worm'): void => {
		const s = spec();
		const base = {x: Math.round(s.res.x / 2), y: Math.round(s.res.y / 2)};
		const e = name === 'worm'
			? {name, seed: Math.random().toString(36).slice(2, 5), ...base}
			: name === 'stone'
				? {name, ...base, r: 0, radius: 38, speed: 60}
				: {name, ...base, r: 0, radius: 30};
		patch({enemies: [...s.enemies, e]});
	};
	const removeEnemy = (i: number): void => {
		patch({enemies: spec().enemies.filter((_, idx) => idx !== i)});
	};

	// Шаблон-калька: читаем файл в data-URL, авто-подгоняем под размер уровня.
	const loadTemplate = (file: File): void => {
		const reader = new FileReader();
		reader.onload = () => {
			const src = String(reader.result);
			const img = new Image();
			img.onload = () => {
				const res = spec().res;
				const scale = Math.min(res.x / img.naturalWidth, res.y / img.naturalHeight) || 1;
				editorStore.getState().setTemplate({src, x: 0, y: 0, scale, opacity: 0.5, locked: false});
			};
			img.src = src;
		};
		reader.readAsDataURL(file);
	};
	const patchTpl = (p: Partial<import('./store').Template>): void => editorStore.getState().patchTemplate(p);

	const exportJson = (): void => {
		try {
			const level = buildLevel();
			const blob = new Blob([JSON.stringify(level, null, 2)], {type: 'application/json'});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${level.name}.json`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			alert('Validation failed: ' + (e instanceof Error ? e.message : String(e)));
		}
	};

	const importJson = async (file: File): Promise<void> => {
		try {
			const text = await file.text();
			const lvl = JSON.parse(text);
			// Импорт level → spec: используем walls как «зафиксированный» путь
			// невозможно (level хранит полигон, не spec). Пока грузим базовые
			// поля; стены придётся перерисовать через path. TODO: level→spec.
			patch({
				res: lvl.res,
				gravity: lvl.gravity,
				startPoint: lvl.startPoint,
				finishPoint: lvl.finishPoint,
				stars: [lvl.star1, lvl.star2, lvl.star3],
				enemies: lvl.enemies ?? [],
				decor: lvl.decorations ?? [],
			});
		} catch (e) {
			alert('Import failed: ' + (e instanceof Error ? e.message : String(e)));
		}
	};

	return (
		<div class="ed-panel">
			<div class="ed-panel__row ed-panel__toolbar">
				<button class="ed-btn" onClick={props.onExit}>← Exit</button>
				<button class="ed-btn" disabled={(ed(), !canUndo())} onClick={undo}>↶ Undo</button>
				<button class="ed-btn" disabled={(ed(), !canRedo())} onClick={redo}>↷ Redo</button>
			</div>

			<div class="ed-section">
				<div class="ed-section__title">Level</div>
				<label class="ed-field"><span>Name/№</span>
					<input type="number" value={spec().n} onInput={(e) => patch({n: +e.currentTarget.value})} />
				</label>
				<label class="ed-field"><span>Width</span>
					<input type="number" value={spec().res.x} onInput={(e) => patch({res: {...spec().res, x: +e.currentTarget.value}})} />
				</label>
				<label class="ed-field"><span>Height</span>
					<input type="number" value={spec().res.y} onInput={(e) => patch({res: {...spec().res, y: +e.currentTarget.value}})} />
				</label>
				<label class="ed-field"><span>Gravity X</span>
					<input type="number" value={spec().gravity.x} onInput={(e) => patch({gravity: {...spec().gravity, x: +e.currentTarget.value}})} />
				</label>
				<label class="ed-field"><span>Gravity Y</span>
					<input type="number" value={spec().gravity.y} onInput={(e) => patch({gravity: {...spec().gravity, y: +e.currentTarget.value}})} />
				</label>
				<label class="ed-field"><span>Seed</span>
					<input type="number" value={spec().seed} onInput={(e) => patch({seed: +e.currentTarget.value})} />
				</label>
			</div>

			<div class="ed-section">
				<div class="ed-section__title">Corridor width</div>
				<input
					class="ed-slider"
					type="range" min="80" max="200" step="5"
					value={spec().mainWidths[0] ?? 120}
					onInput={(e) => {
						const w = +e.currentTarget.value;
						patch({mainWidths: spec().mainPath.map(() => w)});
					}}
				/>
				<div class="ed-hint">Drag blue waypoints on canvas to reshape the path</div>
			</div>

			<div class="ed-section">
				<div class="ed-section__title">Template (калька)</div>
				<Show
					when={ed().template}
					fallback={
						<>
							<label class="ed-btn ed-file">
								⬆ Загрузить картинку
								<input type="file" accept="image/*" style={{display: 'none'}}
									onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) loadTemplate(f); }} />
							</label>
							<div class="ed-hint">Референс-карта под пещерой — рисуй путь поверх неё.</div>
						</>
					}
				>
					{(t) => (
						<>
							<label class="ed-field"><span>Прозрачность</span>
								<input class="ed-slider" type="range" min="0.05" max="1" step="0.05"
									value={t().opacity}
									onInput={(e) => patchTpl({opacity: +e.currentTarget.value})} />
							</label>
							<label class="ed-field"><span>Масштаб</span>
								<input class="ed-slider" type="range" min="0.05" max="4" step="0.05"
									value={t().scale}
									onInput={(e) => patchTpl({scale: +e.currentTarget.value})} />
							</label>
							<label class="ed-field"><span>Зафиксировать</span>
								<input type="checkbox" checked={t().locked}
									onChange={(e) => patchTpl({locked: e.currentTarget.checked})} />
							</label>
							<button class="ed-btn ed-btn--sm" onClick={() => editorStore.getState().clearTemplate()}>✕ Убрать шаблон</button>
							<div class="ed-hint">{t().locked
								? 'Залочен — клики проходят сквозь, можно рисовать.'
								: 'Разлочен — таскай мышью, чтобы выровнять.'}</div>
						</>
					)}
				</Show>
			</div>

			<div class="ed-section">
				<div class="ed-section__title">Enemies ({spec().enemies.length})</div>
				<div class="ed-panel__row">
					<button class="ed-btn" onClick={() => addEnemy('mine')}>+ Mine</button>
					<button class="ed-btn" onClick={() => addEnemy('stone')}>+ Stone</button>
					<button class="ed-btn" onClick={() => addEnemy('worm')}>+ Worm</button>
				</div>
				<For each={spec().enemies}>
					{(e, i) => (
						<div class="ed-entity">
							<span>{e.name} @ {e.x},{e.y}</span>
							<button class="ed-btn ed-btn--sm" onClick={() => removeEnemy(i())}>✕</button>
						</div>
					)}
				</For>
			</div>

			<div class="ed-section ed-panel__footer">
				<button class="ed-btn ed-btn--primary" onClick={props.onPlaytest}>▶ Playtest</button>
				<button class="ed-btn ed-btn--primary" onClick={exportJson}>⬇ Export JSON</button>
				<label class="ed-btn ed-file">
					⬆ Import
					<input type="file" accept="application/json" style={{display: 'none'}}
						onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void importJson(f); }} />
				</label>
			</div>

			<Show when={spec().enemies.length === 0 && spec().mainPath.length > 0}>
				<div class="ed-hint">Tip: place a path, add enemies, then Playtest before exporting.</div>
			</Show>
		</div>
	);
}
