import {execSync} from 'node:child_process';
import {defineConfig} from 'vite';
import solid from 'vite-plugin-solid';


/**
 * Версия билда — комбинируем package.json#version (сейчас 0.0.0) и
 * git short-sha. На Render-сборках $RENDER_GIT_COMMIT доступен; локально
 * берём из `git rev-parse --short HEAD`. Если git недоступен (CI без
 * .git) — падаем на 'dev'.
 */
function buildVersion(): string {
	try {
		const rendered = process.env['RENDER_GIT_COMMIT'];
		if (rendered) return rendered.slice(0, 7);
		const sha = execSync('git rev-parse --short HEAD', {encoding: 'utf8'}).trim();
		return sha;
	} catch {
		return 'dev';
	}
}


const APP_VERSION = buildVersion();


export default defineConfig({
	plugins: [solid()],
	define: {
		__APP_VERSION__: JSON.stringify(APP_VERSION),
	},
	server: {
		port: 5173,
		host: true,
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				changeOrigin: true,
				rewrite: (p) => p.replace(/^\/api/, ''),
			},
		},
	},
	build: {
		target: 'es2022',
		sourcemap: true,
	},
});
