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
	reset: {
		privateOnly: '<i>/reset only works in DM with the bot.</i>',
		confirm: '⚠️ <b>Reset all progress?</b>\n\nWill remove: per-level records (global + every chat), star total. Will keep: fuel, coins, skins, payments.',
		yes: 'Yes, reset',
		no: 'Cancel',
		done: 'Progress reset',
		doneFull: '✅ Progress reset. Hit /play to start over.',
		cancelled: 'Cancelled.',
	},
	feedback: {
		intro: '🐞 <b>Found a bug or have an idea?</b>\n\nDrop it here — we read everything.',
		button: 'Open',
		notConfigured: '<i>Feedback channel not configured yet.</i>',
	},
	group: {
		playInvite: '🚀 <b>Dead Spin</b> is here.\nWho clears levels faster? Tap below — the leaderboard is scoped to this chat only.',
		addedToGroup: '➕ Add to a group',
		welcome: (name: string) => `👋 Hey <b>${name}</b>! We play Dead Spin here — hit <b>/play</b> to join this chat\'s leaderboard.`,
		notify: {
			levelClear: (name: string, level: number) => `🚀 <b>${name}</b> cleared level ${level}`,
			withStars: (stars: number) => ` with ${stars}⭐`,
			personalBest: (time: string) => ` (PB — ${time})`,
			leaderTaken: (newLeader: string, prev: string, level: number) =>
				`👑 <b>${newLeader}</b> kicked <b>${prev}</b> off the level ${level} throne!`,
			firstLeader: (name: string, level: number) =>
				`👑 <b>${name}</b> — first leader on level ${level}!`,
		},
		stats: {
			notRegistered: '<i>Open the bot in DM via /start first.</i>',
			youNothing: '<i>You haven\'t cleared any level in this chat yet. /play — let\'s go!</i>',
			youTitle: (name: string) => `📊 <b>${name}</b> in this chat`,
			youSummary: (lvls: number, lvlsMax: number, stars: number, starsMax: number) =>
				`🏁 Levels: <code>${lvls}/${lvlsMax}</code>   ⭐ Stars: <code>${stars}/${starsMax}</code>`,
			bestEmpty: '<i>No one has cleared a level in this chat yet.</i>',
			bestTitle: '🏆 <b>Chat top</b>',
		},
		identity: {
			adminOnly: '<i>Only chat admins can change team name / emoji.</i>',
			usageName: 'Usage: <code>/setname Oleg\'s Crew</code>',
			usageEmoji: 'Usage: <code>/setemoji 🚀</code>',
			tooLongName: '<i>Too long — max 32 chars.</i>',
			oneEmoji: '<i>Need exactly one emoji.</i>',
			nameSaved: (name: string) => `✅ Team is now <b>${name}</b>.`,
			emojiSaved: (e: string) => `✅ Team emoji: ${e}`,
		},
		challenge: {
			usage: 'Usage: <code>/challenge @username 5</code>',
			userNotFound: (u: string) => `<i>Couldn't find @${u} among players. They might not have opened the bot via /start yet.</i>`,
			selfChallenge: '<i>Can\'t challenge yourself.</i>',
			alreadyPending: '<i>You already have an active duel on this level with this player.</i>',
			posted: (a: string, b: string, level: number) =>
				`👊 <b>${a}</b> challenges <b>${b}</b> on level ${level}!\n\nOne attempt each — first run counts. More stars > less time.`,
			waitingFor: (who: string, otherStars: number, otherTime: string, opponent: string, level: number) =>
				`⏳ <b>${who}</b> ran level ${level}: ${otherStars}⭐ <code>${otherTime}</code>. <b>${opponent}</b>'s turn.`,
			result: (winner: string, loser: string, level: number, ws: number, wt: string, ls: number, lt: string) =>
				`✅ <b>Duel on level ${level} finished!</b>\n\n🏆 <b>${winner}</b> wins: ${ws}⭐ ${wt}\n   <b>${loser}</b>: ${ls}⭐ ${lt}`,
			oneSided: (winner: string, level: number, ws: number, wt: string, loser: string) =>
				`⏰ <b>Time\'s up.</b>\n\n🏆 On level ${level} <b>${winner}</b> wins ${ws}⭐ ${wt} — <b>${loser}</b> didn\'t play.`,
			tie: (a: string, b: string, level: number) =>
				`🤝 Tie on level ${level}: <b>${a}</b> and <b>${b}</b> — same score.`,
		},
	},
};
