import type {Bot} from 'grammy';

type BotCommand = {command: string; description: string};


/**
 * Регистрирует две раздельные коллекции команд в `setMyCommands` со scope:
 *  - private chats — DM-меню (start/menu/help/shop)
 *  - all group chats — игровые: play/lb/me/best
 *
 * Без этого Telegram показывал бы единый список во всех чатах, и в
 * группах висели бы бесполезные /shop /menu, а в DM — /lb /me которые
 * там тоже не работают.
 */
export async function registerCommandsScopes(bot: Bot): Promise<void> {
	const dmCommands: BotCommand[] = [
		{command: 'menu',  description: 'Главное меню'},
		{command: 'start', description: 'Регистрация / приветствие'},
		{command: 'shop',  description: 'Магазин'},
		{command: 'help',  description: 'Справка'},
	];

	const groupCommands: BotCommand[] = [
		{command: 'play', description: 'Открыть игру в этой беседе'},
		{command: 'lb',   description: 'Лидерборд уровня (например, /lb 5)'},
		{command: 'me',   description: 'Моя статистика в этой беседе'},
		{command: 'best', description: 'Топ беседы по сумме звёзд'},
	];

	try {
		await bot.api.setMyCommands(dmCommands, {scope: {type: 'all_private_chats'}});
		await bot.api.setMyCommands(groupCommands, {scope: {type: 'all_group_chats'}});
	} catch (e) {
		console.warn('setMyCommands failed:', e instanceof Error ? e.message : e);
	}
}
