/**
 * Одноразовый скрипт — гарантирует ровно ОДНУ gravity-decoration в каждом
 * level JSON где есть глобальная гравитация (≠ {0,0}).
 *
 * История: первая версия добавляла 2 стрелки для диагональной гравитации
 * (down + right для (8,12)). Сейчас рендерер поддерживает один спрайт с
 * произвольным углом (см. renderers/decorations.ts), поэтому достаточно
 * одной стрелки направленной по вектору гравитации.
 *
 * Также стрелка отодвинута от startPoint на 180px (раньше было 110, что
 * прижимало её слишком близко к кораблю).
 *
 * Идемпотентно: на каждом запуске СНАЧАЛА выбрасывает все name='gravity'
 * decorations, затем добавляет одну свежую — так чисто, без зависимости
 * от состояния файла.
 *
 *   pnpm --filter @dead-spin/levels exec tsx scripts/inject-gravity-decorations.ts
 */

import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LevelSchema} from '@dead-spin/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');

type Vec = {x: number; y: number};
type Decoration = {
	name: 'static' | 'stop' | 'gravity';
	x: number;
	y: number;
	r: number;
	s: number;
	src?: string;
	type?: 'up' | 'down' | 'left' | 'right';
};

/**
 * Угол вектора (gx, gy) В ГРАДУСАХ так, чтобы текстура «стрелка вниз»
 * указывала туда. Текстура нарисована стрелкой по +Y оси (вниз) при r=0.
 * Нужный rotation: atan2(gx, gy) — потому что (sin r, cos r) должно
 * совпасть с нормализованным (gx, gy)/|g|.
 */
function angleDegFromGravity(g: Vec): number {
	if (Math.abs(g.x) < 0.5 && Math.abs(g.y) < 0.5) return 0;
	return (Math.atan2(g.x, g.y) * 180) / Math.PI;
}

const OFFSET_FROM_START = 180;

function placeArrow(start: Vec, g: Vec): Vec {
	const mag = Math.hypot(g.x, g.y);
	if (mag < 0.5) return {x: start.x, y: start.y};
	const nx = g.x / mag;
	const ny = g.y / mag;
	return {
		x: Math.round(start.x + nx * OFFSET_FROM_START),
		y: Math.round(start.y + ny * OFFSET_FROM_START),
	};
}

const files = readdirSync(dataDir)
	.filter((f) => f.endsWith('.json'))
	.sort((a, b) => Number(a.replace(/\.json$/, '')) - Number(b.replace(/\.json$/, '')));

let touched = 0;
let cleared = 0;

for (const file of files) {
	const path = join(dataDir, file);
	const raw = JSON.parse(readFileSync(path, 'utf8')) as {
		gravity: Vec;
		startPoint: Vec;
		decorations: Decoration[];
		[k: string]: unknown;
	};

	// 1) Чистим все прежние gravity-decorations (могло быть 1 или 2 после
	//    предыдущего скрипта). Хвосты `type` остаются неиспользуемыми —
	//    renderer их игнорирует, но повторное накопление мусора нам не нужно.
	const filtered = raw.decorations.filter((d) => d.name !== 'gravity');
	const removed = raw.decorations.length - filtered.length;

	// 2) Если гравитации нет — просто сохраняем (если что-то выкинули).
	const angleDeg = angleDegFromGravity(raw.gravity);
	const hasGravity = Math.abs(raw.gravity.x) >= 0.5 || Math.abs(raw.gravity.y) >= 0.5;

	if (!hasGravity) {
		if (removed > 0) {
			raw.decorations = filtered;
			writeFileSync(path, JSON.stringify(raw, null, 2));
			cleared++;
			console.log(`L${file.padEnd(9)} no gravity — removed ${removed} stale arrow(s)`);
		}
		continue;
	}

	// 3) Кладём одну свежую стрелку.
	const pos = placeArrow(raw.startPoint, raw.gravity);
	const arrow: Decoration = {
		name: 'gravity',
		x: pos.x,
		y: pos.y,
		r: Math.round(angleDeg * 100) / 100, // 2 знака после запятой — стабильно
		s: 0.9,
		type: 'down', // renderer игнорирует, нужен для Zod schema validation
	};
	raw.decorations = [arrow, ...filtered];

	const parsed = LevelSchema.safeParse(raw);
	if (!parsed.success) {
		console.error(`L${file}: validation FAILED:`);
		for (const i of parsed.error.issues) console.error(`  ${i.path.join('.')}: ${i.message}`);
		continue;
	}

	writeFileSync(path, JSON.stringify(raw, null, 2));
	console.log(
		`L${file.padEnd(9)} gravity=(${raw.gravity.x},${raw.gravity.y}) angle=${angleDeg.toFixed(1)}° offset=${OFFSET_FROM_START}px (removed ${removed} old)`,
	);
	touched++;
}

console.log(`\n${touched} arrows refreshed, ${cleared} cleaned of stale arrows.`);
