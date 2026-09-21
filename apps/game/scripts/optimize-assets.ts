/**
 * Пережатие ассетов под реальные размеры отрисовки (GDD §16.3).
 *
 * Проблема: UI-иконки лежали в 1024×1024 по 0.4–1.4 МБ и рисовались
 * высотой в строку текста; в сумме 17 МБ на 33 файла и ~136 МБ
 * декодированных bitmap'ов в памяти WebView.
 *
 * Правила (по месту отрисовки в styles.css, с запасом ×3 под DPR):
 *   icons/*            → 256 px, кроме крупных (result-mood 130px,
 *                        туториал до 180 px) → 512 px; PNG с палитрой
 *   hole.png           → 512 px (Pixi-текстура финиша, alpha)
 *   global-bg.png      → JPEG q82 (RGB без альфы, CSS-фон экрана)
 *   остальные PNG      → без ресайза, только палитровое квантование
 *   *.jpg              → перекодировать mozjpeg q80
 *
 * Идемпотентно: файл переписывается только если новый вариант меньше.
 * Оригиналы — в истории git и в _backups/. Запуск из корня репо:
 *
 *   pnpm exec tsx apps/game/scripts/optimize-assets.ts
 */

import {readdirSync, statSync, readFileSync, writeFileSync, unlinkSync} from 'node:fs';
import {join, dirname, extname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');

/** Иконки, которые рисуются крупно (130 px и туториальные карточки). */
const LARGE_ICONS = new Set([
	'crash-icon.png',
	'pause-icon.png',
	'icon-tap.png',
	'icon-boost.png',
	'icon-mine-warning.png',
	'icon-stone-warning.png',
	'icon-worm-warning.png',
]);
const SKIP_DIRS = new Set(['music', 'font', 'comics', 'map-ref']);

type Rule = {maxSize?: number; toJpeg?: boolean};

function ruleFor(rel: string): Rule | null {
	const name = basename(rel);
	const ext = extname(name).toLowerCase();
	const top = rel.split('/')[0]!;
	if (SKIP_DIRS.has(top)) return null;
	if (name.startsWith('DEP_')) return null;
	if (ext === '.jpg' || ext === '.jpeg') return {};
	if (ext !== '.png') return null;
	if (top === 'icons') return {maxSize: LARGE_ICONS.has(name) ? 512 : 256};
	if (name === 'hole.png') return {maxSize: 512};
	if (name === 'global-bg.png') return {toJpeg: true};
	return {};
}

function walk(dir: string, out: string[] = []): string[] {
	for (const e of readdirSync(dir)) {
		const full = join(dir, e);
		if (statSync(full).isDirectory()) walk(full, out);
		else out.push(full);
	}
	return out;
}

async function main(): Promise<void> {
	const files = walk(PUBLIC);
	let before = 0,
		after = 0,
		changed = 0;
	const renamed: string[] = [];

	for (const full of files) {
		const rel = full
			.slice(PUBLIC.length + 1)
			.split('\\')
			.join('/');
		const rule = ruleFor(rel);
		if (!rule) continue;

		const src = readFileSync(full);
		const inSize = src.length;
		before += inSize;

		let img = sharp(src);
		if (rule.maxSize)
			img = img.resize({width: rule.maxSize, height: rule.maxSize, fit: 'inside', withoutEnlargement: true});

		let out: Buffer;
		let outPath = full;
		if (rule.toJpeg) {
			out = await img.jpeg({quality: 82, mozjpeg: true}).toBuffer();
			outPath = full.replace(/\.png$/i, '.jpg');
		} else if (extname(full).toLowerCase() === '.png') {
			out = await img.png({palette: true, quality: 90, compressionLevel: 9, effort: 8}).toBuffer();
		} else {
			out = await img.jpeg({quality: 80, mozjpeg: true}).toBuffer();
		}

		if (out.length < inSize || outPath !== full) {
			writeFileSync(outPath, out);
			if (outPath !== full) {
				unlinkSync(full);
				renamed.push(`${rel} → ${basename(outPath)}`);
			}
			after += out.length;
			changed++;
			console.log(
				`${(inSize / 1024).toFixed(0).padStart(6)} → ${(out.length / 1024).toFixed(0).padStart(6)} KB  ${rel}`,
			);
		} else {
			after += inSize;
		}
	}

	console.log(`\nизменено файлов: ${changed}`);
	console.log(`было ${(before / 1048576).toFixed(1)} MB → стало ${(after / 1048576).toFixed(1)} MB`);
	if (renamed.length) console.log('переименовано (обновить ссылки в коде):\n  ' + renamed.join('\n  '));
}

void main();
