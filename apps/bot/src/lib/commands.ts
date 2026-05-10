import type {Bot} from 'grammy';
import {ru} from '../i18n/ru';
import {en} from '../i18n/en';

type BotCommand = {command: string; description: string};


/**
 * Регистрирует команды + описание бота при старте.
 *
 * `setMyCommands` со scope:
 *   - private chats — DM-меню (start/menu/help/shop/...)
 *   - all group chats — игровые: play/lb/me/best/...
 * Без scope Telegram показывал бы единый список во всех чатах, и в группах
 * висели бы бесполезные /shop /menu, а в DM — /lb /me.
 *
 * Каждая коллекция дублируется на ru и en через `language_code` — TG
 * показывает список на языке клиента, fallback на EN-без-языка.
 *
 * `setMyDescription` / `setMyShortDescription` — что юзер видит в карточке
 * бота: short появляется в шапке профиля, long — на пустом экране до
 * первого сообщения. Тоже с per-language вариантом.
 */
export async function registerBotMeta(bot: Bot): Promise<void> {
	const dmRu: BotCommand[] = [
		{command: 'menu',     description: 'Главное меню'},
		{command: 'start',    description: 'Регистрация / приветствие'},
		{command: 'shop',     description: 'Магазин'},
		{command: 'help',     description: 'Справка'},
		{command: 'feedback', description: 'Сообщить о баге'},
		{command: 'reset',    description: 'Сбросить прогресс'},
	];

	const dmEn: BotCommand[] = [
		{command: 'menu',     description: 'Main menu'},
		{command: 'start',    description: 'Register / welcome'},
		{command: 'shop',     description: 'Shop'},
		{command: 'help',     description: 'Help'},
		{command: 'feedback', description: 'Report a bug'},
		{command: 'reset',    description: 'Reset progress'},
	];

	const groupRu: BotCommand[] = [
		{command: 'play',      description: 'Открыть игру в этой беседе'},
		{command: 'lb',        description: 'Лидерборд уровня (например, /lb 5)'},
		{command: 'me',        description: 'Моя статистика в этой беседе'},
		{command: 'best',      description: 'Топ беседы по сумме звёзд'},
		{command: 'challenge', description: 'Дуэль с игроком: /challenge @user 5'},
		{command: 'feedback',  description: 'Сообщить о баге'},
	];

	const groupEn: BotCommand[] = [
		{command: 'play',      description: 'Open the game in this chat'},
		{command: 'lb',        description: 'Level leaderboard (e.g., /lb 5)'},
		{command: 'me',        description: 'Your stats in this chat'},
		{command: 'best',      description: 'Chat top by total stars'},
		{command: 'challenge', description: 'Duel a player: /challenge @user 5'},
		{command: 'feedback',  description: 'Report a bug'},
	];

	try {
		// EN — без language_code = дефолт для любых не-русских клиентов.
		await bot.api.setMyCommands(dmEn, {scope: {type: 'all_private_chats'}});
		await bot.api.setMyCommands(groupEn, {scope: {type: 'all_group_chats'}});
		await bot.api.setMyCommands(dmRu, {scope: {type: 'all_private_chats'}, language_code: 'ru'});
		await bot.api.setMyCommands(groupRu, {scope: {type: 'all_group_chats'}, language_code: 'ru'});
	} catch (e) {
		console.warn('setMyCommands failed:', e instanceof Error ? e.message : e);
	}

	try {
		await bot.api.setMyShortDescription(en.meta.shortDescription);
		await bot.api.setMyShortDescription(ru.meta.shortDescription, {language_code: 'ru'});
		await bot.api.setMyDescription(en.meta.description);
		await bot.api.setMyDescription(ru.meta.description, {language_code: 'ru'});
	} catch (e) {
		console.warn('setMyDescription failed:', e instanceof Error ? e.message : e);
	}
}
