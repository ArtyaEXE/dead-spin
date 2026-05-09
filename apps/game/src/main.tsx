/* @refresh reload */
import {render} from 'solid-js/web';
import App from './App';
import {initSentry} from './sentry';
import {initAnalytics} from './analytics';
import './ui/styles.css';


// Sentry — до рендера, чтобы ошибки самой инициализации тоже ловились.
// Без VITE_SENTRY_DSN no-op.
initSentry();
// PostHog для product analytics. Без VITE_POSTHOG_KEY — no-op.
initAnalytics();


const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
render(() => <App />, root);
