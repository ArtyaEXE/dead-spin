import {readdirSync, readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LevelSchema} from '@dead-spin/shared';


const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');


function naturalSortByNumber(a: string, b: string): number {
	const na = Number(a.replace(/\.json$/, ''));
	const nb = Number(b.replace(/\.json$/, ''));
	return na - nb;
}


const files = readdirSync(dataDir)
	.filter(f => f.endsWith('.json'))
	.sort(naturalSortByNumber);

console.log(`Validating ${files.length} level file(s) in ${dataDir}\n`);

let passed = 0;
let failed = 0;

for (const file of files) {
	const raw = JSON.parse(readFileSync(join(dataDir, file), 'utf8')) as unknown;
	const result = LevelSchema.safeParse(raw);

	if (result.success) {
		const L = result.data;
		console.log(
			`  OK   ${file.padEnd(10)}  res=${L.res.x}x${L.res.y}  walls=${L.walls.length} ` +
			`points=${L.walls.reduce((s, w) => s + w.length, 0)}  ` +
			`enemies=${L.enemies.length}  decorations=${L.decorations.length}`
		);
		passed++;
	} else {
		console.log(`  FAIL ${file}`);
		for (const issue of result.error.issues) {
			console.log(`    • ${issue.path.join('.')}: ${issue.message}`);
		}
		failed++;
	}
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
