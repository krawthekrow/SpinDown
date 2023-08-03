const path = require('path');

module.exports = {
	SERVER: 'irc.freenode.net',
	PORT: 6667, // optional
	SECURE: false, // optional
	SELF_SIGNED: false, // optional
	BOT_NICK: 'BOT_NICK',
	MY_NICK: 'YOUR_NICK',
	BOT_REALNAME: 'BOT_REALNAME',
	BOT_USERNAME: 'BOT_USERNAME',
	BOT_HOSTMASK: '',
	BOT_SASL_PASSWORD: 'p4ssw0rd',
	AUTOJOIN: [
		'#my-fav-channel'
	], // optional
	COMMAND_PREFIX: '::',
	PERMISSION_GROUPS: [
		['admin', [
			'irc:username@hostmask',
			'discord:username#1234',
		]]
	],
	BOT_DISCORD_TOKEN: 'YOUR_TOKEN', // optional
	DISCORD_USER_IDS: {
		// discord IDs for usernames mentioned in this config file,
		// for additional stability
		'username': '12345678901234567890',
	},
	DISCORD_CHANNEL_IDS: {
		// discord IDs for channels mentioned in this config file,
		// for additional stability
		'discord:server#channel': '12345678901234567890',
	},
	PLUGIN_WHITELIST: {
		// only channels listed here will have a whitelist applied; all other
		// channels will have access to all commands
		'discord:server#channel': ['bridge'],
	},
	PLUGINS_CONFIG: {
		GENERAL: {
			OBSERVATIONS_FILENAME:
				path.resolve(__dirname, 'db/observations.txt')
		},
		HANGMAN: {
			WORDLIST_FILENAME:
				path.resolve(__dirname, 'db/wordlist_long.txt')
		},
		POWDER: {
			CACHE_FILENAME: path.resolve(__dirname, 'db/powder_cache.txt'),
			WATCH_FILENAME:
				path.resolve(__dirname, 'db/powder_watch.txt'),
			UPDATE_MIN_INTERVAL: 10 * 1000,
			DB_PATH: '/var/db/powder.db' // needs to be a full path
		},
		BRIDGE: {
			BLACKLIST: [
				'irc:nick@titlebot/hostmask',
			],
			NICK_BLACKLISTS: {
				// nicks to blacklist, per source channel
				'irc:#channel': [
					'nick',
				],
			},
			// webhook messages from channels on this blacklist will not be relayed
			WEBHOOK_BLACKLIST: [
				'discord:server#channel',
			],
			MENTION_BLACKLIST: [
				// nick highlights from this list will not be bridged
				// as mentions
				'nick',
			],
			MENTION_ALIASES: [
				// translation table (from left nick to right nick) for mentions
				['nick1', 'nick2'],
			],
			LINKS: [
				['irc:#channel', 'discord:server#channel'],
			],
			JOIN_PART_LINKS: [
				['irc:#channel', 'discord:server#channel'],
			],
		},
		EAT: {
			CHANNEL: 'discord:server#channel',
			HIGHLIGHT_USER: 'username#1234',
			QGEN_FILENAME: path.resolve(
				__dirname, 'src/plugins/qgen/QuestionGenerator.js'
			)
		},
	},
};
