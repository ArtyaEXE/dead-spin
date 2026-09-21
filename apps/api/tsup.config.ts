import {defineConfig} from 'tsup';

/**
 * Прод-сборка API в один файл на вход. Workspace-пакеты (@dead-spin/*)
 * вбандливаются — они поставляются исходниками без собственного build;
 * npm-зависимости остаются внешними и ставятся в рантайме.
 *
 * Раньше в проде работал `node --import tsx src/index.ts`: TypeScript
 * транспилировался на каждом холодном старте, а tsx сидел в dependencies.
 */
export default defineConfig({
	entry: {
		index: 'src/index.ts',
		migrate: 'scripts/migrate-db.ts',
	},
	format: ['esm'],
	target: 'node22',
	platform: 'node',
	outDir: 'dist',
	clean: true,
	sourcemap: true,
	splitting: false,
	noExternal: [/^@dead-spin\//],
});
