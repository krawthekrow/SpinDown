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
			return this.val.recipient.id == user.val.id;
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
			return this.val.type == 'dm';
		default:
			throw new Error('unrecognized channel type');
		}
	}
	get name() {
		switch (this.type) {
		case Channel.TYPE_IRC:
			return this.val.name;
		case Channel.TYPE_DISCORD:
			return `#${this.val.name}`;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	get fullName() {
		switch (this.type) {
		case Channel.TYPE_IRC:
			return this.name;
		case Channel.TYPE_DISCORD:
			if ('guild' in this.val)
				return `${this.val.guild.name}${this.name}`;
			return this.name;
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
		switch (chan1.type) {
		case Channel.TYPE_IRC:
			return chan1.name == chan2.name;
		case Channel.TYPE_DISCORD:
			return chan1.id == chan2.id;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	static fromString(str, ircCli, discordCli) {
		let chan = Channel.findByPreciseFullName(ircCli, discordCli, str);
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

		return null;
	}
	static findByFullName(type, ircCli, discordCli, name) {
		let chan = Channel.findByPreciseFullName(ircCli, discordCli, name);
		if (chan != null)
			return chan;

		switch (type) {
		case Channel.TYPE_IRC:
			if (!(name in ircCli.chans))
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

			const genericChan = discordCli.channels.find(chan => {
				if (chan.guild == null)
					return match[1] == '' && chan.name == match[2];
				return (
					chan.guild.name == match[1] &&
					chan.name == match[2]
				);
			});
			if (genericChan == null)
				return null;
			const val = discordCli.channels.get(genericChan.id);
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
			return this.val.guild.member(user.val.id) != null;
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
				if ('*_~`'.includes(str[index])) {
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
};

Channel.REGEX_IRC = /^irc:(.*)$/;
Channel.REGEX_DISCORD = /^discord:(.*)$/;

Channel.REGEX_FIND_DISCORD = /^([^#]*)#(.*)$/;

Channel.TYPE_IRC = 0;
Channel.TYPE_DISCORD = 1;

Channel.IrcChannelData = IrcChannelData;

module.exports = Channel;