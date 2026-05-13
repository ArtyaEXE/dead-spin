import {eq, sql} from 'drizzle-orm';
import {db} from '../db/client';
import {dailyRewards, users} from '../db/schema';


/**
 * Daily check-in: первый запрос юзера в новый UTC-день начисляет бонус.
 * Идея — дать тривиальный повод вернуться завтра. Стрик копится; на
 * пропуске одного дня сбрасывается на 1.
 *
 * Награды по дням стрика — фиксированный rotation. Не делаем линейный
 * рост (станет abusive), и не растим бесконечно.
 */


type RewardKind = {fuel: number; coins: number};


function rewardForStreak(streakDays: number): RewardKind {
	switch (streakDays) {
		case 1: return {fuel: 500, coins: 0};
		case 2: return {fuel: 1000, coins: 0};
		case 3: return {fuel: 0, coins: 25};
		case 4: return {fuel: 2000, coins: 0};
		case 5: return {fuel: 0, coins: 50};
		case 6: return {fuel: 3000, coins: 0};
		default: return {fuel: 0, coins: 100};
	}
}


function todayUtc(): string {
	return new Date().toISOString().slice(0, 10);
}


function dayDiff(a: string, b: string): number {
	const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
	const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
	return Math.round((ta - tb) / 86_400_000);
}


export type ClaimResult =
	| {claimed: true; streakDays: number; reward: RewardKind; nextReward: RewardKind}
	| {claimed: false; reason: 'alreadyClaimed'; streakDays: number; nextReward: RewardKind};


/**
 * Состояние дневного бонуса без претензии на claim. Используется UI'ем
 * («можно/нельзя забрать сегодня; если нельзя — какой будет следующий»).
 */
export async function getDailyState(userId: string): Promise<{
	canClaim: boolean;
	streakDays: number;
	nextReward: RewardKind;
}> {
	const [row] = await db.select().from(dailyRewards).where(eq(dailyRewards.userId, userId)).limit(1);
	const today = todayUtc();
	if (!row) {
		return {canClaim: true, streakDays: 0, nextReward: rewardForStreak(1)};
	}
	const diff = dayDiff(today, row.lastClaimDate);
	if (diff === 0) {
		return {canClaim: false, streakDays: row.streakDays, nextReward: rewardForStreak(row.streakDays + 1)};
	}
	const nextStreak = diff === 1 ? row.streakDays + 1 : 1;
	return {canClaim: true, streakDays: nextStreak - 1, nextReward: rewardForStreak(nextStreak)};
}


export async function claimDaily(userId: string): Promise<ClaimResult> {
	const today = todayUtc();
	const [row] = await db.select().from(dailyRewards).where(eq(dailyRewards.userId, userId)).limit(1);

	let streakDays: number;
	if (!row) {
		streakDays = 1;
		await db.insert(dailyRewards).values({
			userId, streakDays: 1, longestStreak: 1, lastClaimDate: today,
		});
	} else {
		const diff = dayDiff(today, row.lastClaimDate);
		if (diff === 0) {
			return {
				claimed: false, reason: 'alreadyClaimed',
				streakDays: row.streakDays,
				nextReward: rewardForStreak(row.streakDays + 1),
			};
		}
		streakDays = diff === 1 ? row.streakDays + 1 : 1;
		await db.update(dailyRewards)
			.set({
				streakDays,
				longestStreak: Math.max(row.longestStreak, streakDays),
				lastClaimDate: today,
				updatedAt: sql`now()`,
			})
			.where(eq(dailyRewards.userId, userId));
	}

	const reward = rewardForStreak(streakDays);

	// Зачисляем награду на user.fuel/coins. Внешние источники (daily-claim,
	// referral, Stars-покупка) НЕ клампятся к FUEL_MAX — это «премиум»
	// топливо сверх потолка. Авторегенерация остановится на FUEL_MAX,
	// над-cap пополнения копятся отдельно.
	if (reward.fuel > 0) {
		await db.update(users)
			.set({
				fuel: sql`fuel + ${reward.fuel}`,
				fuelUpdatedAt: sql`now()`,
				updatedAt: sql`now()`,
			})
			.where(eq(users.id, userId));
	}
	if (reward.coins > 0) {
		await db.update(users)
			.set({coins: sql`coins + ${reward.coins}`, updatedAt: sql`now()`})
			.where(eq(users.id, userId));
	}

	return {
		claimed: true,
		streakDays,
		reward,
		nextReward: rewardForStreak(streakDays + 1),
	};
}
