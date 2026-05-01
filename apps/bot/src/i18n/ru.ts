export const ru = {
	welcome: {
		title: '🚀 <b>Dead Spin</b>',
		greeting: (name: string) => `Привет, <b>${name}</b>!`,
		tagline: 'Физическая аркада — проведи корабль через лабиринт, собери звёзды и не разбейся.',
		onboardingPaused: 'Игра на технической паузе. Попробуй позже.',
		notAllowed: 'К сожалению, сейчас доступ закрыт. Обратись к администратору.',
		needUsername: 'Чтобы играть, нужен username в Telegram. Зайди в <b>Настройки → Имя пользователя</b> и задай его, потом нажми <b>/start</b>.',
		registered: 'Регистрация завершена. Добро пожаловать!',
	},
	menu: {
		play: '🎮 Играть',
		leaderboard: '🏆 Лидерборд',
		shop: '💎 Магазин',
		profile: '👤 Профиль',
		settings: '⚙️ Настройки',
		help: '❓ Помощь',
		back: '⬅️ Назад',
		home: '🏠 Главная',
	},
	profile: {
		title: '👤 <b>Профиль</b>',
		fuel: '⛽ Топливо',
		stars: '⭐ Звёзды',
		coins: '💰 Монеты',
		levels: '🏁 Уровни пройдено',
		since: '📅 С нами с',
		tip: '<i>Прокачай корабль в магазине.</i>',
	},
	shop: {
		title: '💎 <b>Магазин</b>',
		intro: 'Покупка за Telegram Stars ⭐',
		buy: 'Купить',
		processing: '⏳ Создаю счёт...',
		success: (title: string) => `✅ Куплено: <b>${title}</b>. Награды зачислены.`,
		failed: '❌ Платёж не прошёл.',
	},
	leaderboard: {
		title: (level: number) => `🏆 <b>Лидерборд — уровень ${level}</b>`,
		empty: '<i>Пока никто не прошёл этот уровень.</i>',
		myRank: (rank: number) => `Твой ранг: <b>#${rank}</b>`,
		notPlayedYet: '<i>Ты ещё не проходил этот уровень.</i>',
		prevLevel: '◀️',
		nextLevel: '▶️',
	},
	settings: {
		title: '⚙️ <b>Настройки</b>',
		language: 'Язык интерфейса',
		languageRu: '🇷🇺 Русский',
		languageEn: '🇬🇧 English',
		saved: '✅ Сохранено',
	},
	help: {
		title: '❓ <b>Помощь</b>',
		intro: 'Всё, что нужно знать:',
		howToPlay: {
			q: 'Как играть?',
			a: 'Нажми кнопку «Играть» — откроется мини-приложение. Тапом по экрану включается бустер, корабль летит вперёд. Задача — пройти уровень не разбившись.',
		},
		fuel: {
			q: 'Что такое топливо?',
			a: 'Каждый бустер тратит топливо. Запас восстанавливается автоматически — ~500 единиц каждые 10 секунд, максимум 30 000. Можно докупить в магазине.',
		},
		stars: {
			q: 'Что такое звёзды?',
			a: 'На каждом уровне спрятаны три звезды. Чем больше собрал — тем больше очков. Они складываются в общий рекорд.',
		},
		records: {
			q: 'Как улучшать рекорды?',
			a: 'Собрал больше звёзд — рекорд обновится. Собрал столько же, но быстрее — рекорд тоже обновится. Лучшие попадают в лидерборд.',
		},
		support: 'По любым вопросам напиши администратору.',
	},
	common: {
		loading: '⏳ Загрузка...',
		error: '❌ Что-то пошло не так, попробуй ещё раз.',
		notFound: 'Не найдено.',
	},
	group: {
		playInvite: '🚀 <b>Dead Spin</b> подключён.\nКто пройдёт уровни быстрее? Жми кнопку ниже — лидерборд считается только среди этой беседы.',
		addedToGroup: '➕ Добавить в беседу',
		welcome: (name: string) => `👋 Привет, <b>${name}</b>! Тут играют в Dead Spin — жми <b>/play</b> и попадёшь в лидерборд этой беседы.`,
		notify: {
			levelClear: (name: string, level: number) => `🚀 <b>${name}</b> прошёл уровень ${level}`,
			withStars: (stars: number) => ` на ${stars}⭐`,
			personalBest: (time: string) => ` (личный рекорд — ${time})`,
			leaderTaken: (newLeader: string, prev: string, level: number) =>
				`👑 <b>${newLeader}</b> скинул <b>${prev}</b> с лидерской позиции уровня ${level}!`,
			firstLeader: (name: string, level: number) =>
				`👑 <b>${name}</b> — первый лидер уровня ${level}!`,
		},
		stats: {
			notRegistered: '<i>Сначала открой бот в личке через /start.</i>',
			youNothing: '<i>Пока что в этой беседе ты не прошёл ни одного уровня. /play — поехали!</i>',
			youTitle: (name: string) => `📊 <b>${name}</b> в этой беседе`,
			youSummary: (lvls: number, lvlsMax: number, stars: number, starsMax: number) =>
				`🏁 Уровни: <code>${lvls}/${lvlsMax}</code>   ⭐ Звёзды: <code>${stars}/${starsMax}</code>`,
			bestEmpty: '<i>В этой беседе ещё никто не прошёл ни одного уровня.</i>',
			bestTitle: '🏆 <b>Топ беседы</b>',
		},
		identity: {
			adminOnly: '<i>Только админы беседы могут менять название/эмодзи команды.</i>',
			usageName: 'Использование: <code>/setname Команда Олега</code>',
			usageEmoji: 'Использование: <code>/setemoji 🚀</code>',
			tooLongName: '<i>Слишком длинно — до 32 символов.</i>',
			oneEmoji: '<i>Нужен ровно один эмодзи.</i>',
			nameSaved: (name: string) => `✅ Команда теперь называется <b>${name}</b>.`,
			emojiSaved: (e: string) => `✅ Эмодзи команды: ${e}`,
		},
		challenge: {
			usage: 'Использование: <code>/challenge @username 5</code>',
			userNotFound: (u: string) => `<i>Не нашёл @${u} среди игроков. Возможно, он ещё ни разу не открывал бот через /start.</i>`,
			selfChallenge: '<i>Себя вызвать нельзя.</i>',
			alreadyPending: '<i>У вас уже есть активная дуэль на этом уровне с этим игроком.</i>',
			posted: (a: string, b: string, level: number) =>
				`👊 <b>${a}</b> вызывает <b>${b}</b> на уровень ${level}!\n\nКаждый играет один раз — какой результат у первого прохождения, тот и зачтётся. Больше звёзд > меньше времени.`,
			waitingFor: (who: string, otherStars: number, otherTime: string, opponent: string, level: number) =>
				`⏳ <b>${who}</b> сыграл уровень ${level}: ${otherStars}⭐ <code>${otherTime}</code>. Ход за <b>${opponent}</b>.`,
			result: (winner: string, loser: string, level: number, ws: number, wt: string, ls: number, lt: string) =>
				`✅ <b>Дуэль на уровне ${level} завершена!</b>\n\n🏆 Победил <b>${winner}</b>: ${ws}⭐ ${wt}\n   <b>${loser}</b>: ${ls}⭐ ${lt}`,
			oneSided: (winner: string, level: number, ws: number, wt: string, loser: string) =>
				`⏰ <b>Время вышло.</b>\n\n🏆 На уровне ${level} победил <b>${winner}</b> ${ws}⭐ ${wt} — <b>${loser}</b> так и не сыграл.`,
			tie: (a: string, b: string, level: number) =>
				`🤝 Ничья на уровне ${level}: <b>${a}</b> и <b>${b}</b> — одинаковый счёт.`,
		},
	},
};
