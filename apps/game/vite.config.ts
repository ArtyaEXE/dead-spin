import {defineConfig} from 'vite';
import solid from 'vite-plugin-solid';


export default defineConfig({
	plugins: [solid()],
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
