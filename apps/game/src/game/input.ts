/**
 * Ввод: один обработчик pointerdown (MouseEvent+TouchEvent через единый API),
 * чтобы не дублировать touch-версию как в оригинальном Game.svelte.
 */
export function bindBoostInput(el: HTMLElement, onBoost: () => void): () => void {
	const handler = (e: PointerEvent) => {
		e.preventDefault();
		onBoost();
	};
	el.addEventListener('pointerdown', handler);
	return () => el.removeEventListener('pointerdown', handler);
}
