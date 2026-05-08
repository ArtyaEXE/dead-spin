/// <reference types="vite/client" />

/**
 * Build-time константы — инжектятся через `define` в vite.config.ts.
 * Не трогать руками, только обновлять в vite-конфиге.
 */
declare const __APP_VERSION__: string;
