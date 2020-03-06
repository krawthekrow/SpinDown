const config = require('../../config.js').PLUGINS.BRIDGE;
const Channel = require('../Channel.js');
const net = require('net');

class BridgePlugin {
	constructor(env) {
		this.env = env;
		this.ircCli = this.env.ircCli;
		this.discordCli = this.env.discordCli;

		this.links = [];
		for (const linkSpec of config.LINKS) {
			let link = [];
			for (const chanSpec of linkSpec) {
				link.push(Channel.fromString(
					chanSpec, this.ircCli, this.discordCli
				));
			}
			this.links.push(link);
		}

		this.joinPartLinks = [];
		for (const linkSpec of config.JOIN_PART_LINKS) {
			let link = [];
			for (const chanSpec of linkSpec) {
				link.push(Channel.fromString(
					chanSpec, this.ircCli, this.discordCli
				));
			}
			this.joinPartLinks.push(link);
		}

		let allJoinPartChannels = [];
		for (const link of this.joinPartLinks) {
			for (const chan of link) {
				let alreadyIn = false;
				for (const ochan of allJoinPartChannels) {
					if (Channel.equal(chan, ochan)) {
						alreadyIn = true;
						break;
					}
				}
				if (alreadyIn)
					continue;
				allJoinPartChannels.push(chan);
			}
		}
		for (const chan of allJoinPartChannels) {
			const downstreams = this.getJoinPartDownstreams(chan);
			for (const ochan of downstreams) {
				if (chan.type != Channel.TYPE_IRC)
					continue;
				if (ochan.type != Channel.TYPE_DISCORD)
					continue;
				this.updateOnlineList(chan, ochan);
			}
		}
	}
	getDownstreams(chan, links = this.links) {
		let downstreams = [];
		for (const link of links) {
			let inLink = false;
			for (const ochan of link) {
				if (Channel.equal(chan, ochan)) {
					inLink = true;
					break;
				}
			}
			if (!inLink)
				continue;
			for (const ochan of link) {
				if (Channel.equal(chan, ochan))
					continue;
				downstreams.push(ochan);
			}
		}
		return downstreams;
	}
	getJoinPartDownstreams(chan) {
		return this.getDownstreams(chan, this.joinPartLinks);
	}
	getPrettyDate() {
		return new Date().toISOString().replace('T', ' ').replace(/\..+/, '');
	}
	handleIrcJoin(user, chan) {
		const downstreams = this.getJoinPartDownstreams(chan);
		for (const ochan of downstreams) {
			this.updateOnlineList(chan, ochan);
			this.env.sendMessageNoBridge(
				ochan, `[UTC ${this.getPrettyDate()}] Join: ${user.getNick(chan)}`
			);
		}
	}
	handleIrcPart(user, chan) {
		const downstreams = this.getJoinPartDownstreams(chan);
		for (const ochan of downstreams) {
			this.updateOnlineList(chan, ochan);
			this.env.sendMessageNoBridge(
				ochan, `[UTC ${this.getPrettyDate()}] Leave: ${user.getNick(chan)}`
			);
		}
	}
	handleIrcQuit(user, chan) {
		const downstreams = this.getJoinPartDownstreams(chan);
		for (const ochan of downstreams) {
			this.updateOnlineList(chan, ochan);
			this.env.sendMessageNoBridge(
				ochan, `[UTC ${this.getPrettyDate()}] Quit: ${user.getNick(chan)}`
			);
		}
	}
	handleIrcNickChange(user, chan, newNick) {
		const downstreams = this.getJoinPartDownstreams(chan);
		for (const ochan of downstreams) {
			this.updateOnlineList(chan, ochan);
			this.env.sendMessageNoBridge(
				ochan, `[UTC ${this.getPrettyDate()}] Nick change: ${user.getNick(chan)} ==> ${newNick}`
			);
		}
	}
	// here msg is a string
	handleInternalMessage(user, chan, msg) {
		const downstreams = this.getDownstreams(chan);
		for (const ochan of downstreams) {
			const processedMsg = this.convertMessage(
				chan, ochan, msg, []
			);
			this.relayMsg(chan, ochan, user, processedMsg);
		}
	}
	handleFullMessage(user, chan, msg) {
		const downstreams = this.getDownstreams(chan);
		for (const ochan of downstreams) {
			// convertMessage takes a Message, but
			// processedMsg is a string
			const processedMsg = this.convertMessage(
				chan, ochan, msg.content, msg.attachments
			);
			this.relayMsg(chan, ochan, user, processedMsg);
		}
	}
	relayMsg(fromChan, toChan, user, msg) {
		const nick = user.getNick(fromChan);
		let nickPrepend;
		switch (toChan.type) {
		case Channel.TYPE_IRC:
			nickPrepend = `[${nick}]`;
			break;
		case Channel.TYPE_DISCORD:
			nickPrepend = `[${nick}]`;
			break;
		default:
			throw new Error('unrecognized channel type');
		}
		switch (toChan.type) {
		case Channel.TYPE_IRC:
			const lines = msg.split('\n');
			if (lines.length > 5 || msg.length > BridgePlugin.IRC_MSG_MAX_LEN * 4) {
				const tcpst = net.createConnection(7777, 'tcp.st');
				tcpst.on('data', (data) => {
					const tcpstLines = data.toString().split('\n');
					tcpst.write(msg);
					tcpst.end();
					let tcpstUrl = '';
					for (const tcpstLine of tcpstLines) {
						if (tcpstLine.startsWith('URL ')) {
							tcpstUrl = tcpstLine.substring(4);
							this.env.sendMessageNoBridge(
								toChan, `${nickPrepend} [ ${tcpstUrl} ]`
							);
							return;
						}
					}
					console.error('could not find url line in tcpst');
					console.error(data);
				});
				tcpst.on('error', (err) => {
					this.env.sendMessageNoBridge(
						toChan, `${nickPrepend} [ error contacting tcp.st - long message omitted ]`
					);
					console.error(err);
				});
				break;
			}
			for (let line of lines) {
				// don't allow lines that are too long
				for (let i = 0; i < 4; i++) {
					if (line.length == 0)
						break;
					line = `${nickPrepend} ${line}`;
					let lineSplit = line;
					if (line.length >= BridgePlugin.IRC_MSG_MAX_LEN) {
						lineSplit = line.substring(0, BridgePlugin.IRC_MSG_MAX_LEN);
						line = line.substring(BridgePlugin.IRC_MSG_MAX_LEN);
					}
					else
						line = '';
					this.env.sendMessageNoBridge(
						toChan, lineSplit
					);
				}
			}
			break;
		case Channel.TYPE_DISCORD:
			this.env.sendMessageNoBridge(
				toChan, `${nickPrepend} ${msg}`
			);
			break;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	convertMessage(from, to, msg, attachments) {
		const fromType = from.type;
		const toType = to.type;
		if (fromType == toType)
			return msg;

		let index, newmsg;
		if (fromType == Channel.TYPE_IRC) {
			msg = this.encodeDiscordUserMentions(msg, to);
			msg = to.escapeIrcStr(msg);

			return msg;
		}
		if (fromType == Channel.TYPE_DISCORD &&
				toType == Channel.TYPE_IRC) {
			msg = msg.replace(/\\([^a-zA-Z0-9\\s])/g, '$1');

			msg = this.decodeDiscordUserMentions(msg, from);

			for (const attachment of attachments) {
				if (msg != '')
					msg += '\n';
				msg += `[ ${attachment.url} ]`;
			}

			return msg;
		}
		throw new Error('unrecognized conversion');
	}
	decodeDiscordUserMentions(msg, chan) {
		const re = BridgePlugin.USER_MENTION_REGEX;
		re.lastIndex = 0;
		let index = 0;
		let newmsg = '';
		for (;;) {
			const match = BridgePlugin.USER_MENTION_REGEX.exec(msg);
			if (match == null) {
				newmsg += msg.substr(index);
				break;
			}
			if (match.length != 2)
				throw new Error('match should have length 2');

			const user = this.discordCli.users.get(match[1]);
			if (user === undefined) {
				newmsg += msg.substring(index, re.lastIndex);
				index = re.lastIndex;
				continue;
			}
			const member = chan.val.guild.member(user);
			if (member === undefined) {
				newmsg += msg.substring(index, re.lastIndex);
				index = re.lastIndex;
				continue;
			}

			newmsg += msg.substring(index, match.index);
			index = re.lastIndex;
			newmsg += `@${member.displayName}`;
		}
		return newmsg;
	}
	static sanitizeMention(str) {
		return str.toLowerCase().replace(/[^a-z0-9]/g, '');
	}
	encodeDiscordUserMentions(msg, chan) {
		if (chan.val.members == null)
			return msg;

		const re = BridgePlugin.PLAIN_MENTION_REGEX;
		re.lastIndex = 0;
		let index = 0;
		let newmsg = '';
		for (;;) {
			const match = re.exec(msg);
			if (match == null) {
				newmsg += msg.substr(index);
				break;
			}
			if (match.length != 5)
				throw new Error('match should have length 5');
			if (match[1] == '' && match[3] == '') {
				newmsg += msg.substring(index, re.lastIndex);
				index = re.lastIndex;
				continue;
			}

			const nick = match[2].toLowerCase();
			let memberMatches = chan.val.members.filter(member => {
				return member.displayName.toLowerCase() == nick ||
					member.user.username.toLowerCase() == nick ||
					member.user.tag.toLowerCase() == nick;
			});
			if (memberMatches.size == 0) {
				memberMatches = chan.val.members.filter(member => {
					return BridgePlugin.sanitizeMention(member.displayName) == nick ||
						BridgePlugin.sanitizeMention(member.user.username) == nick ||
						BridgePlugin.sanitizeMention(member.user.tag) == nick;
				});
			}
			if (memberMatches.size == 0 && nick.length >= 3) {
				memberMatches = chan.val.members.filter(member => {
					return BridgePlugin.sanitizeMention(member.displayName).startsWith(nick) ||
						BridgePlugin.sanitizeMention(member.user.username).startsWith(nick) ||
						BridgePlugin.sanitizeMention(member.user.tag).startsWith(nick);
				});
			}
			if (memberMatches.size != 1) {
				newmsg += msg.substring(index, re.lastIndex);
				index = re.lastIndex;
				continue;
			}
			const member = memberMatches.first();
			const hasNick = member.nickname != null;

			newmsg += msg.substring(index, match.index);
			index = re.lastIndex;
			newmsg += `<@${hasNick ? '!':''}${member.id}>${match[4]}`;
		}
		return newmsg;
	}
	updateOnlineList(fromChan, toChan) {
		// fromChan has to be an irc channel,
		// toChan has to be a discord channel
		// note that there is a race condition here, but only the
		// first time this is called
		toChan.val.fetchPinnedMessages().then(messages => {
			let users = Object.keys(
				this.ircCli.chans[fromChan.name].users
			);
			users.sort();
			const userListMsg = `IRC users online: ${users.join(' ')}`;
			if (messages.size == 0) {
				toChan.val.send(userListMsg).then(message => {
					message.pin();
				}).catch(console.error);
				return;	
			}
			if (messages.size != 1)
				throw new Exception('expected at most one pinned message');
			messages.first().edit(userListMsg);
		}).catch(console.error);
	}
};

BridgePlugin.USER_MENTION_REGEX = new RegExp('<@!?([0-9]+)>', 'g');
BridgePlugin.ROLE_MENTION_REGEX = new RegExp('<@&([0-9]+)>', 'g');
BridgePlugin.CHANNEL_MENTION_REGEX = new RegExp('<#([0-9]+)>', 'g');

BridgePlugin.PLAIN_MENTION_REGEX = new RegExp('(@?)([^\\s,:]+)([:,]?)(\\s|$)', 'g');

BridgePlugin.IRC_MSG_MAX_LEN = 400;

module.exports = BridgePlugin;
