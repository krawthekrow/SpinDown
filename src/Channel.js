const User = require('./User.js');

class IrcChannelData {
	constructor(name, client) {
		this.name = name;
		this.client = client;
	}
	get id() {
		return this.name;
	}
};

class Channel {
	constructor(type, val) {
		this.type = type;
		this.val = val;
	}
	isQueryTo(user) {
		if (!this.isQuery)
			return false;
		if (this.type != user.type)
			return false;
		switch (this.type) {
		case Channel.TYPE_IRC:
			return this.name == user.getNick(this);
		case Channel.TYPE_DISCORD:
			if ('recipient' in this.val)
				return this.val.recipient.id == user.val.id;
			return this.val.id == user.val.id;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	get isQuery() {
		switch (this.type) {
		case Channel.TYPE_IRC:
			if (this.name.length < 1)
				throw new Error('zero-length channel name');
			return this.name[0] != '#';
		case Channel.TYPE_DISCORD:
			return 'username' in this.val || this.val.type == 'dm';
		default:
			throw new Error('unrecognized channel type');
		}
	}
	get name() {
		switch (this.type) {
		case Channel.TYPE_IRC:
			return this.val.name;
		case Channel.TYPE_DISCORD:
			if ('username' in this.val)
				return this.val.username;
			if ('recipient' in this.val)
				return this.val.recipient.username;
			return `#${this.val.name}`;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	get fullName() {
		switch (this.type) {
		case Channel.TYPE_IRC:
			return `irc:${this.name}`;
		case Channel.TYPE_DISCORD:
			if ('guild' in this.val)
				return `discord:${this.val.guild.name}#${this.val.name}`;
			if ('tag' in this.val)
				return `discord-dm:${this.val.tag}`;
			return `discord:${this.name}`;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	get id() {
		switch (this.type) {
		case Channel.TYPE_IRC:
			return `irc:${this.val.id}`;
		case Channel.TYPE_DISCORD:
			return `discord:${this.val.id}`;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	static getDmChan(ircCli, discordCli, user) {
		switch (user.type) {
		case User.TYPE_IRC:
			return new Channel(
				Channel.TYPE_IRC,
				new Channel.IrcChannelData(
					user.val.nick,
					ircCli
				)
			);
		case User.TYPE_DISCORD:
			return new Channel(
				Channel.TYPE_DISCORD,
				user.val
			);
		default:
			throw new Error('unrecognized user type');
		}
	}
	static getReplyChan(chan, user) {
		if (chan.type == Channel.TYPE_IRC && chan.isQuery)
			return new Channel(
				Channel.TYPE_IRC,
				new Channel.IrcChannelData(
					user.getNick(chan),
					chan.val.client
				)
			);
		return chan;
	}
	static equal(chan1, chan2) {
		if (chan1.type != chan2.type)
			return false;
		return chan1.id == chan2.id;
	}
	static fromString(str, ircCli, discordCli) {
		const chan = Channel.findByPreciseFullName(ircCli, discordCli, str);
		if (chan != null)
			return chan;

		throw new Error(`cannot find channel ${str}`);
	}
	static findByPreciseFullName(ircCli, discordCli, name) {
		let match;

		match = Channel.REGEX_IRC.exec(name);
		if (match != null) {
			if (match.length != 2)
				throw new Error('match should have length 2');
			return Channel.findByFullName(
				Channel.TYPE_IRC, ircCli, discordCli, match[1]
			);
		}

		match = Channel.REGEX_DISCORD.exec(name);
		if (match != null) {
			if (match.length != 2)
				throw new Error('match should have length 2');
			return Channel.findByFullName(
				Channel.TYPE_DISCORD, ircCli, discordCli, match[1]
			);
		}

		match = Channel.REGEX_DISCORD_DM.exec(name);
		if (match != null) {
			if (match.length != 2)
				throw new Error('match should have length 2');
			const user = discordCli.users.cache.find(user => user.tag == match[1]);
			if (user == null)
				return null;
			return new Channel(
				Channel.TYPE_DISCORD,
				user
			);
		}

		return null;
	}
	static findByFullName(type, ircCli, discordCli, name) {
		let chan = Channel.findByPreciseFullName(ircCli, discordCli, name);
		if (chan != null)
			return chan;

		switch (type) {
		case Channel.TYPE_IRC:
			if (name.length < 1)
				throw new Error('zero-length channel name');
			if (name[0] == '#' && !(name in ircCli.chans))
				return null;
			return new Channel(
				Channel.TYPE_IRC,
				new Channel.IrcChannelData(
					name, ircCli
				)
			);
		case Channel.TYPE_DISCORD:
			const match = Channel.REGEX_FIND_DISCORD.exec(name);
			if (match == null)
				return null;
			if (match.length != 3)
				throw new Error('expected match of length 3');

			const genericChan = [...discordCli.channels.cache.values()].find(chan => {
				if (chan.guild == null)
					return match[1] == '' && chan.name == match[2];
				return (
					chan.guild.name == match[1] &&
					chan.name == match[2]
				);
			});
			if (genericChan == null)
				return null;
			const val = discordCli.channels.cache.get(genericChan.id);
			return new Channel(Channel.TYPE_DISCORD, val);
		default:
			throw new Error('unrecognized channel type');
		}
	}
	hasUser(user) {
		if (this.type != user.type)
			return false;
		switch (this.type) {
		case Channel.TYPE_IRC:
			return !this.isQuery &&
				user.val.nick in this.val.client.chans[this.name].users;
		case Channel.TYPE_DISCORD:
			return !this.isQuery &&
				this.val.guild.member(user.val.id) != null;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	hasPowderBotInsecure() {
		return this.type == Channel.TYPE_IRC &&
			!this.isQuery &&
			'PowderBot' in this.val.client.chans[this.name].users;
	}
	escapeIrcStr(str) {
		switch (this.type) {
		case Channel.TYPE_IRC:
			return str;
		case Channel.TYPE_DISCORD:
			let index = 0;
			let newstr = '';
			while (index < str.length) {
				if (str.startsWith('http://', index) || str.startsWith('https://', index)) {
					while (index < str.length && !/\s/.test(str[index])) {
						newstr += str[index];
						index++;
					}
					continue;
				}
				if ('*_~`:[]'.includes(str[index])) {
					newstr += `\\${str[index]}`;
					index++;
					continue;
				}
				newstr += str[index];
				index++;
			}
			return newstr;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	getRoleByName(roleName) {
		const roleMatches = this.val.guild.roles.cache.filter((role) => {
			return role.name == roleName;
		});
		if (roleMatches.size != 1) {
			return null;
		}
		return roleMatches.first();
	}
	encodeRoleMention(roleName) {
		const role = this.getRoleByName(roleName);
		if (role == null) {
			return null;
		}
		return `<@&${role.id}>`;
	}
	getRoleMembers(roleName) {
		const role = this.getRoleByName(roleName);
		if (role == null) {
			return null;
		}
		return role.members;
	}
	encodeMention(nick, allowShorthand = true) {
		if (this.type != Channel.TYPE_DISCORD) {
			return null;
		}
		if (this.val.type == 'dm') {
			return nick;
		}
		// Channel.fromString('discord:powder-subframe#subframe', null, this.discordCli).val.guild.members.fetch().then(console.log)
		let memberMatches = this.val.members.filter(member => {
			return member.displayName.toLowerCase() == nick ||
				member.user.username.toLowerCase() == nick ||
				member.user.tag.toLowerCase() == nick;
		});
		const sanitizeMention = (str) => {
			return str.toLowerCase().replace(/[^a-z0-9]/g, '');
		}
		if (memberMatches.size == 0) {
			memberMatches = this.val.members.filter(member => {
				return sanitizeMention(member.displayName) == nick ||
					sanitizeMention(member.user.username) == nick ||
					sanitizeMention(member.user.tag) == nick;
			});
		}
		if (allowShorthand && memberMatches.size == 0 && nick.length >= 3) {
			memberMatches = this.val.members.filter(member => {
				return sanitizeMention(member.displayName).startsWith(nick) ||
					sanitizeMention(member.user.username).startsWith(nick) ||
					sanitizeMention(member.user.tag).startsWith(nick);
			});
		}
		if (memberMatches.size != 1) {
			return null;
		}
		const member = memberMatches.first();
		const hasNick = member.nickname != null;

		return `<@${hasNick ? '!':''}${member.id}>`;
	}
};

Channel.REGEX_IRC = /^irc:(.*)$/;
Channel.REGEX_DISCORD = /^discord:(.*)$/;
Channel.REGEX_DISCORD_DM = /^discord-dm:(.*)$/;

Channel.REGEX_FIND_DISCORD = /^([^#]*)#(.*)$/;

Channel.TYPE_IRC = 0;
Channel.TYPE_DISCORD = 1;

Channel.IrcChannelData = IrcChannelData;

module.exports = Channel;
