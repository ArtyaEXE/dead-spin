import posthog from 'posthog-js';

/**
 * Клиентская аналитика. Без `VITE_POSTHOG_KEY` — no-op. Это даёт
 * безопасный default: проект собирается и работает без PostHog'а;
 * включится когда добавишь ключ в env при деплое Mini App.
 *
 * Не отслеживаем:
 *   - тачи / мышь (privacy-overhead)
 *   - тексты ввода
 *   - точные координаты (только структурированные события игры)
 */

let enabled = false;

export function initAnalytics(): void {
	const key = import.meta.env['VITE_POSTHOG_KEY'] as string | undefined;
	if (!key) return;
	const host = (import.meta.env['VITE_POSTHOG_HOST'] as string | undefined) ?? 'https://eu.i.posthog.com';
	posthog.init(key, {
		api_host: host,
		// Captures отключаем те, что нам не нужны — у нас Mini App, а не сайт.
		capture_pageview: false,
		capture_pageleave: false,
		autocapture: false,
		disable_session_recording: true,
		persistence: 'localStorage',
	});
	enabled = true;
	console.log('PostHog analytics initialized');
}

export function identify(userId: string, traits?: Record<string, unknown>): void {
	if (!enabled) return;
	posthog.identify(userId, traits);
}

export function track(event: string, properties?: Record<string, unknown>): void {
	if (!enabled) return;
	posthog.capture(event, properties);
}
