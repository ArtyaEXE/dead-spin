/* @refresh reload */
import {render} from 'solid-js/web';
import App from './App';
import {initSentry} from './sentry';
import './ui/styles.css';


// Sentry — до рендера, чтобы ошибки самой инициализации тоже ловились.
// Без VITE_SENTRY_DSN no-op.
initSentry();


const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
render(() => <App />, root);
