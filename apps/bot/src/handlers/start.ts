import type {Context} from 'grammy';
import {InlineKeyboard} from 'grammy';
import {eq, sql} from 'drizzle-orm';
import {db, schema} from '../db';
import {t} from '../i18n';
import {env} from '../config';
import {ensureUser} from '../lib/user';
import {LINE} from '../lib/format';
import {showMainMenu} from './menu';
import {handlePlayInGroup} from './groups';


const REFERRAL_BONUS_NEW = 1000;    // fuel новому
const REFERRAL_BONUS_INVITER = 200; // coins пригласившему


/**
 * Парсит "ref_<tgId>" из start-параметра (`/start ref_123456789` или
 * deep-link `?start=ref_123456789`). Возвращает tgId приглашающего,
 * либо null если формат не подошёл / номер невалидный.
 */
function parseReferralPayload(raw: string | undefined): string | null {
	if (!raw) return null;
	const m = /^ref_(\d{1,15})$/.exec(raw);
	return m ? m[1]! : null;
}


/**
 * Применяет реферальный бонус для нового юзера: +N топлива новичку,
 * +M coins пригласившему. Защиты:
 *  - referrer существует и не сам новый юзер
 *  - юзер ещё не имеет referrer_id (иначе можно было бы сменить
 *    приглашающего повторным /start ref_other)
 */
async function applyReferral(args: {
	newUserId: string;
	newUserTgId: string;
	referrerTgId: string;
}): Promise<{applied: boolean; inviterTgId?: string; inviterUsername?: string}> {
	const {newUserId, newUserTgId, referrerTgId} = args;
	if (referrerTgId === newUserTgId) return {applied: false};

	const [referrer] = await db.select()
		.from(schema.users)
		.where(eq(schema.users.tgId, referrerTgId))
		.limit(1);
	if (!referrer) return {applied: false};

	// Защита от двойного применения: новый юзер ещё без referrer_id.
	const [newUser] = await db.select()
		.from(schema.users)
		.where(eq(schema.users.id, newUserId))
		.limit(1);
	if (!newUser || newUser.referrerId) return {applied: false};

	await db.transaction(async (tx) => {
		await tx.update(schema.users)
			.set({
				referrerId: referrerTgId,
				fuel: sql`least(fuel + ${REFERRAL_BONUS_NEW}, 30000)`,
				fuelUpdatedAt: sql`now()`,
				updatedAt: sql`now()`,
			})
			.where(eq(schema.users.id, newUserId));

		await tx.update(schema.users)
			.set({
				coins: sql`coins + ${REFERRAL_BONUS_INVITER}`,
				updatedAt: sql`now()`,
			})
			.where(eq(schema.users.id, referrer.id));
	});

	return {applied: true, inviterTgId: referrerTgId, inviterUsername: referrer.username};
}


/**
 * /start — онбординг.
 *
 * 1) Валидируем Telegram-юзера (нужен username).
 * 2) Ensure user в БД, на первом входе — создаём + allowlist (в dev авто).
 * 3) Если пришёл по реф-ссылке `?start=ref_<tgId>` — выдаём бонус обоим.
 * 4) Показываем welcome-сообщение (новому юзеру) или сразу главное меню.
 */
export async function handleStart(ctx: Context): Promise<void> {
	if (!ctx.from || !ctx.chat) return;
	if (ctx.from.is_bot) return;

	// /start в группе — DM-меню не пройдёт (Telegram возвращает
	// BUTTON_TYPE_INVALID для web_app в группе). Показываем приглашение играть.
	if (ctx.chat.type !== 'private') {
		await handlePlayInGroup(ctx);
		return;
	}

	const tgId = String(ctx.from.id);
	const username = ctx.from.username ?? '';
	const locale = ctx.from.language_code ?? 'en';
	const L = t(locale);

	if (!username) {
		await ctx.reply(L.welcome.needUsername, {parse_mode: 'HTML'});
		return;
	}

	const result = await ensureUser({tgId, username, locale});
	if (!result.ok) {
		await ctx.reply(L.welcome.notAllowed, {parse_mode: 'HTML'});
		return;
	}

	// Реф-бонус — только новому юзеру (старые не подменяют пригласившего).
	let referralNote = '';
	if (result.isNew) {
		const startPayload = ctx.message?.text?.split(' ')[1];
		const referrerTgId = parseReferralPayload(startPayload);
		if (referrerTgId) {
			const ref = await applyReferral({
				newUserId: result.user.id,
				newUserTgId: tgId,
				referrerTgId,
			});
			if (ref.applied && ref.inviterUsername) {
				const UL = t(result.user.locale);
				referralNote = '\n\n' + UL.welcome.referralBonus(ref.inviterUsername, REFERRAL_BONUS_NEW);
				// Уведомляем пригласившего о награде.
				try {
					const IUL = t(result.user.locale);
					await ctx.api.sendMessage(
						Number(ref.inviterTgId!),
						IUL.welcome.referralReward(username, REFERRAL_BONUS_INVITER),
						{parse_mode: 'HTML'},
					);
				} catch {/* пригласивший заблокировал бота — не валим */}
			}
		}
	}

	if (!result.isNew) {
		await showMainMenu(ctx);
		return;
	}

	const UL = t(result.user.locale);
	const caption = [
		UL.welcome.title,
		'',
		`${UL.welcome.greeting(result.user.username)} ${UL.welcome.subtitle}`,
		'',
		UL.welcome.tagline,
		'',
		LINE,
		'',
		UL.welcome.cta,
		'',
		UL.welcome.social + referralNote,
	].join('\n');

	const kb = new InlineKeyboard()
		.webApp(UL.menu.play, env.WEB_APP_URL).row()
		.text(UL.menu.help, 'help:open').text(UL.menu.home, 'nav:home');

	// Hero-фото с лого игры. Ссылку берём с Cloudflare Pages (тот же
	// origin, что у Mini App — статика всегда доступна). Если photo
	// упадёт (например, не настроен WEB_APP_URL) — фолбэк на текст,
	// чтобы первый /start не пропал.
	const heroUrl = env.WEB_APP_URL
		? `${env.WEB_APP_URL.replace(/\/$/, '')}/dead-spin-logo-shadow.png`
		: null;

	if (heroUrl) {
		try {
			await ctx.replyWithPhoto(heroUrl, {
				caption,
				parse_mode: 'HTML',
				reply_markup: kb,
			});
			return;
		} catch (e) {
			console.warn('hero photo failed, falling back to text:', e instanceof Error ? e.message : e);
		}
	}
	await ctx.reply(caption, {parse_mode: 'HTML', reply_markup: kb});
}
