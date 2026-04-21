import {createSignal, onCleanup} from 'solid-js';
import type {StoreApi} from 'zustand/vanilla';


/**
 * Мост Zustand-vanilla ↔ Solid. Возвращает функцию-хук, которая даёт
 * Solid-signal со всем состоянием стора и ре-рендерит компонент при
 * каждом `.setState()`. Использование:
 *
 *   const state = useAuth();
 *   <div>{state().user?.username}</div>
 */
export function createSolidStoreAdapter<T>(store: StoreApi<T>): () => () => T {
	return () => {
		const [signal, setSignal] = createSignal(store.getState(), {equals: false});
		const unsub = store.subscribe((state) => setSignal(() => state));
		onCleanup(unsub);
		return signal;
	};
}
