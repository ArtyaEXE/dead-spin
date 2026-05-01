export const en = {
	welcome: {
		title: '🚀 <b>Dead Spin</b>',
		greeting: (name: string) => `Hi, <b>${name}</b>!`,
		tagline: 'A physics arcade — steer the ship through the maze, grab the stars, stay alive.',
		onboardingPaused: 'The game is on a technical pause. Try later.',
		notAllowed: 'Sorry, access is closed at the moment. Contact the admin.',
		needUsername: 'You need a Telegram username to play. Go to <b>Settings → Username</b>, set one, then hit <b>/start</b>.',
		registered: "You're in. Welcome aboard!",
	},
	menu: {
		play: '🎮 Play',
		leaderboard: '🏆 Leaderboard',
		shop: '💎 Shop',
		profile: '👤 Profile',
		settings: '⚙️ Settings',
		help: '❓ Help',
		back: '⬅️ Back',
		home: '🏠 Home',
	},
	profile: {
		title: '👤 <b>Profile</b>',
		fuel: '⛽ Fuel',
		stars: '⭐ Stars',
		coins: '💰 Coins',
		levels: '🏁 Levels cleared',
		since: '📅 Member since',
		tip: '<i>Upgrade your ship in the shop.</i>',
	},
	shop: {
		title: '💎 <b>Shop</b>',
		intro: 'Buy with Telegram Stars ⭐',
		buy: 'Buy',
		processing: '⏳ Creating invoice...',
		success: (title: string) => `✅ Purchased: <b>${title}</b>. Rewards granted.`,
		failed: '❌ Payment failed.',
	},
	leaderboard: {
		title: (level: number) => `🏆 <b>Leaderboard — level ${level}</b>`,
		empty: "<i>Nobody has finished this level yet.</i>",
		myRank: (rank: number) => `Your rank: <b>#${rank}</b>`,
		notPlayedYet: "<i>You haven't played this level yet.</i>",
		prevLevel: '◀️',
		nextLevel: '▶️',
	},
	settings: {
		title: '⚙️ <b>Settings</b>',
		language: 'Language',
		languageRu: '🇷🇺 Русский',
		languageEn: '🇬🇧 English',
		saved: '✅ Saved',
	},
	help: {
		title: '❓ <b>Help</b>',
		intro: 'Everything you need to know:',
		howToPlay: {
			q: 'How to play?',
			a: 'Tap the Play button — the Mini App opens. Tap the screen to fire the booster. Clear the level without crashing.',
		},
		fuel: {
			q: 'What is fuel?',
			a: 'Each booster burns fuel. It regenerates ~500 per 10 seconds, up to a cap of 30,000. You can buy more in the shop.',
		},
		stars: {
			q: 'What are stars?',
			a: 'Each level has three hidden stars. The more you collect, the better your run.',
		},
		records: {
			q: 'How do records work?',
			a: 'Collect more stars than before and your record updates. Match stars but finish faster — also an update. The best runs go to the leaderboard.',
		},
		support: 'For anything else, message the admin.',
	},
	common: {
		loading: '⏳ Loading...',
		error: '❌ Something went wrong, try again.',
		notFound: 'Not found.',
	},
	group: {
		playInvite: '🚀 <b>Dead Spin</b> is here.\nWho clears levels faster? Tap below — the leaderboard is scoped to this chat only.',
		addedToGroup: '➕ Add to a group',
		notify: {
			levelClear: (name: string, level: number) => `🚀 <b>${name}</b> cleared level ${level}`,
			withStars: (stars: number) => ` with ${stars}⭐`,
			personalBest: (time: string) => ` (PB — ${time})`,
			leaderTaken: (newLeader: string, prev: string, level: number) =>
				`👑 <b>${newLeader}</b> kicked <b>${prev}</b> off the level ${level} throne!`,
			firstLeader: (name: string, level: number) =>
				`👑 <b>${name}</b> — first leader on level ${level}!`,
		},
	},
};
