import {validateComic, type Comic} from '@dead-spin/shared';
import {levels} from '@dead-spin/levels';
import c1 from './c1.json' with {type: 'json'};

/**
 * Реестр комиксов. Чтобы добавить новый — кладём JSON рядом, импортируем
 * сюда и валидируем через `validateComic`. Все картинки автоматически
 * попадают в прелоад через `getAllComicImages()` — отдельный список в
 * preload.ts больше не нужен.
 *
 * При импорте этого модуля выполняется cross-валидация: если какой-то
 * `level.intro`/`level.outro` указывает на несуществующий id комикса —
 * приложение падает на старте с понятным сообщением, чтобы опечатка
 * ловилась моментально, а не "тихо" в раннтайме при заходе на уровень.
 */

const registry: Readonly<Record<string, Comic>> = {
	c1: validateComic(c1),
};

for (const [i, level] of levels.entries()) {
	for (const ref of [level.intro, level.outro]) {
		if (ref && !registry[ref]) {
			throw new Error(
				`Level ${i + 1} references missing comic "${ref}". ` +
					`Add it to apps/game/src/ui/comics/ or remove the reference.`,
			);
		}
	}
}

export function getComic(id: string): Comic | undefined {
	return registry[id];
}

export function getAllComicImages(): readonly string[] {
	return Object.values(registry).flatMap((c) => c.panels.map((p) => p.img));
}
