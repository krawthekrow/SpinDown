const config = require('../config.js');

class IrcUserData {
	constructor(nick, username, hostmask) {
		this.nick = nick;
		this.tag = `${username}@${hostmask}`;
	}
	get id() {
		return this.tag;
	}
};

class User {
	constructor(type, val) {
		this.type = type;
		this.val = val;
	}
	get highlight() {
		switch(this.type) {
		case User.TYPE_IRC:
			return `${this.val.nick}:`;
		case User.TYPE_DISCORD:
			return `<@${this.val.id}>`;
		default:
			throw new Error('unrecognized user type');
		}
	}
	getNick(chan) {
		if (chan.type != this.type)
			throw new Error('user and channel not the same type');
		switch(this.type) {
		case User.TYPE_IRC:
			return this.val.nick;
		case User.TYPE_DISCORD:
			if (chan.val.guild != null) {
				const member = chan.val.guild.members.cache.get(this.val.id);
				if (member != undefined) {
					return member.displayName;
				}
			}
			return this.val.username;
		default:
			throw new Error('unrecognized user type');
		}
	}
	// this is guaranteed to be unique
	get id() {
		switch(this.type) {
		case User.TYPE_IRC:
			return `irc:${this.val.tag}`;
		case User.TYPE_DISCORD:
			return `discord:${this.val.id}`;
		default:
			throw new Error('unrecognized user type');
		}
	}
	// only for discord
	getIsBot() {
		switch(this.type) {
		case User.TYPE_IRC:
			return false;
		case User.TYPE_DISCORD:
			return this.val.bot;
		default:
			throw new Error('unrecognized user type');
		}
	}
	getIsSelf(ircCli, discordCli) {
		switch(this.type) {
		case User.TYPE_IRC:
			throw new Error('not implemented yet');
		case User.TYPE_DISCORD:
			return this.val.id == discordCli.application.id;
		default:
			throw new Error('unrecognized user type');
		}
	}
	static equal(user1, user2) {
		return user1.id == user2.id;
	}
	// resolve a name specified in the config file
	static resolveConfig(name) {
		let match;

		match = User.REGEX_DISCORD_RESOLVED.exec(name);
		if (match != null) {
			return name;
		}

		match = User.REGEX_DISCORD.exec(name);
		if (match != null) {
			if (match.length != 2)
				throw new Error('match should have length 2');
			const resolvedId = config.DISCORD_USER_IDS[match[1]];
			if (resolvedId == undefined) {
				throw new Error(`unable to resolve ${match[1]}`);
			}
			return `discord:${resolvedId}`;
		}

		// fallthrough for irc
		return name;
	}
};

User.REGEX_DISCORD_RESOLVED = /^discord:(\d+)$/;
User.REGEX_DISCORD = /^discord:(.*)$/;

User.TYPE_IRC = 0;
User.TYPE_DISCORD = 1;

User.IrcUserData = IrcUserData;

module.exports = User;
