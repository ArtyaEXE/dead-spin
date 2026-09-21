#!/usr/bin/env node
// Первичная настройка локального окружения: копирует .env.example → .env там,
// где .env ещё нет, и печатает, что делать дальше. Идемпотентен.

import {existsSync, copyFileSync} from 'node:fs';
import {join} from 'node:path';

const targets = ['apps/api', 'apps/game'];
let created = 0;

for (const dir of targets) {
	const example = join(dir, '.env.example');
	const env = join(dir, '.env');
	if (!existsSync(example)) continue;
	if (existsSync(env)) {
		console.log(`  =  ${env} уже есть`);
		continue;
	}
	copyFileSync(example, env);
	console.log(`  +  ${env} создан из .env.example`);
	created++;
}

console.log(`
Создано файлов: ${created}.
Дальше:
  pnpm db:up        # Postgres в Docker
  pnpm db:migrate   # накатить схему
  pnpm dev          # API :3001 + клиент :5173
`);
process.exit(0);
