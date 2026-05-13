/**
 * Одноразовый скрипт — добавляет gravity-decoration'ы в level JSON где
 * есть глобальная гравитация (≠ {0,0}). Спрайт `deco-gravity-{type}.png`
 * рендерится в `apps/game/src/game/renderers/decorations.ts` — без
 * этих данных в level-JSON стрелки не появляются вовсе.
 *
 * Идемпотентно: если в decorations уже есть entry с name='gravity' —
 * level пропускается, чтобы не плодить дубли.
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


function primaryDirection(g: Vec): 'up' | 'down' | 'left' | 'right' | null {
	if (Math.abs(g.x) < 0.5 && Math.abs(g.y) < 0.5) return null;
	if (Math.abs(g.y) >= Math.abs(g.x)) return g.y > 0 ? 'down' : 'up';
	return g.x > 0 ? 'right' : 'left';
}


function secondaryDirection(g: Vec, primary: 'up' | 'down' | 'left' | 'right'): 'up' | 'down' | 'left' | 'right' | null {
	// Если другая компонента тоже значимая (> 30% от primary) — даём вторую стрелку.
	const isVertical = primary === 'up' || primary === 'down';
	const other = isVertical ? Math.abs(g.x) : Math.abs(g.y);
	const main = isVertical ? Math.abs(g.y) : Math.abs(g.x);
	if (other < 0.5 || other / main < 0.3) return null;
	if (isVertical) return g.x > 0 ? 'right' : 'left';
	return g.y > 0 ? 'down' : 'up';
}


function placeArrow(start: Vec, dir: 'up' | 'down' | 'left' | 'right', offset: number): Vec {
	const dx = dir === 'right' ? offset : dir === 'left' ? -offset : 0;
	const dy = dir === 'down' ? offset : dir === 'up' ? -offset : 0;
	return {x: Math.round(start.x + dx), y: Math.round(start.y + dy)};
}


const files = readdirSync(dataDir)
	.filter(f => f.endsWith('.json'))
	.sort((a, b) => Number(a.replace(/\.json$/, '')) - Number(b.replace(/\.json$/, '')));

let touched = 0;
let skipped = 0;

for (const file of files) {
	const path = join(dataDir, file);
	const raw = JSON.parse(readFileSync(path, 'utf8')) as {
		gravity: Vec;
		startPoint: Vec;
		decorations: Decoration[];
		[k: string]: unknown;
	};

	const primary = primaryDirection(raw.gravity);
	if (!primary) { skipped++; continue; }

	const hasGravityDeco = raw.decorations.some(d => d.name === 'gravity');
	if (hasGravityDeco) { skipped++; continue; }

	const newDecos: Decoration[] = [];
	newDecos.push({
		name: 'gravity',
		x: placeArrow(raw.startPoint, primary, 110).x,
		y: placeArrow(raw.startPoint, primary, 110).y,
		r: 0,
		s: 0.9,
		type: primary,
	});

	const secondary = secondaryDirection(raw.gravity, primary);
	if (secondary) {
		newDecos.push({
			name: 'gravity',
			x: placeArrow(raw.startPoint, secondary, 110).x,
			y: placeArrow(raw.startPoint, secondary, 110).y,
			r: 0,
			s: 0.8,
			type: secondary,
		});
	}

	raw.decorations = [...newDecos, ...raw.decorations];

	const parsed = LevelSchema.safeParse(raw);
	if (!parsed.success) {
		console.error(`L${file}: validation FAILED after injection:`);
		for (const i of parsed.error.issues) console.error(`  ${i.path.join('.')}: ${i.message}`);
		continue;
	}

	writeFileSync(path, JSON.stringify(raw, null, 2));
	console.log(`L${file.padEnd(8)} gravity=(${raw.gravity.x},${raw.gravity.y}) → +${newDecos.length} arrow(s) [${newDecos.map(d => d.type).join(', ')}]`);
	touched++;
}

console.log(`\n${touched} files updated, ${skipped} skipped (no gravity or already has arrow).`);
