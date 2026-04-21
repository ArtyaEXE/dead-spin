import {eq, sql} from 'drizzle-orm';
import {db} from '../db/client';
import {users, type User} from '../db/schema';
import {computeRegenerated} from './fuel';


/**
 * Считает ленивую регенерацию и, если есть изменения, обновляет fuel в БД.
 * Вызывается в middleware requireAuth — так любой авторизованный запрос
 * видит актуальное значение fuel без отдельных кроновых задач.
 */
export async function regenerateFuelInDb(user: User): Promise<User> {
	const now = Date.now();
	const {fuel, fuelUpdatedAtMs} = computeRegenerated(
		user.fuel,
		user.fuelUpdatedAt.getTime(),
		now,
	);

	if (fuel === user.fuel && fuelUpdatedAtMs === user.fuelUpdatedAt.getTime()) {
		return user;
	}

	const nextStamp = new Date(fuelUpdatedAtMs);
	await db.update(users)
		.set({fuel, fuelUpdatedAt: nextStamp, updatedAt: sql`now()`})
		.where(eq(users.id, user.id));

	return {...user, fuel, fuelUpdatedAt: nextStamp};
}
