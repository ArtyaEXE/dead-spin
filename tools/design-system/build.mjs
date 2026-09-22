/**
 * Сборка дизайн-системы Dead Spin.
 *
 * Кит собирается из настоящих исходников проекта — `tokens.css`, `Icon.tsx`,
 * сгенерированных SVG — а не пишется руками. Иначе он разойдётся с игрой на
 * первой же правке и превратится в красивую ложь.
 *
 * Части идут по порядку и перезаписывают файлы друг друга: последняя правда
 * за последней частью. Бренд-книга поэтому собирается в самом конце.
 *
 *   node tools/design-system/build.mjs
 *   DS_OUT=/куда/угодно node tools/design-system/build.mjs
 *
 * Результат — дерево `project/`, которое публикуется в артефакт Design System
 * (см. README.md рядом).
 */

import {readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const parts = readdirSync(join(HERE, 'parts'))
	.filter((f) => f.endsWith('.mjs'))
	.sort();

for (const part of parts) {
	await import(`./parts/${part}`);
}

console.log(`\nсобрано частей: ${parts.length}`);
