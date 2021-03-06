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
			if (chan.val.guild != null)
				return chan.val.guild.member(this.val).displayName;
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
			return `discord:${this.val.tag}`;
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
	static equal(user1, user2) {
		return user1.id == user2.id;
	}
};

User.TYPE_IRC = 0;
User.TYPE_DISCORD = 1;

User.IrcUserData = IrcUserData;

module.exports = User;
