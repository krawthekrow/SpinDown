const config = require('../../config.js').PLUGINS.BRIDGE;
const Channel = require('../Channel.js');
const Message = require('../Message.js');
const User = require('../User.js');
const formatting = require('../formatting.js');
const colors = require('irc-colors');
const net = require('net');
const https = require('https');
const FormData = require('form-data');

const ZWS = '\u200b';

function uploadTcpst(msg, onResp, onErr) {
	const tcpst = net.createConnection(7777, 'tcp.st');
	tcpst.on('data', (data) => {
		const tcpstLines = data.toString().split('\n');
		tcpst.write(msg);
		tcpst.end();
		let tcpstUrl = '';
		for (const tcpstLine of tcpstLines) {
			if (tcpstLine.startsWith('URL ')) {
				onResp(tcpstLine.substring(4));
				return;
			}
		}
		console.error('could not find url line in tcpst');
		console.error(data);
		onErr();
	});
	tcpst.on('error', (err) => {
		console.error(err);
		onErr();
	});
}

function uploadPybin(msg, onResp, onErr) {
	const form = new FormData();
	form.append('c', msg);

	const req = https.request({
		method: 'POST',
		hostname: 'pybin.pw',
		path: '/?u=1',
		port: 443,
		headers: form.getHeaders(),
	});
	form.pipe(req);
	req.on('error', err => {
		console.error(err);
		onErr();
	});
	req.on('response', (res) => {
		if (res.statusCode != 200) {
			console.error(`pybin.pw error: status code ${res.statusCode}`);
			onErr();
			return;
		}
		let body = '';
		res.on('data', (chunk) => {
			body += chunk;
		});
		res.on('end', () => {
			onResp(body.trim());
		});
	});
	req.end();
}

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
		if (config.BLACKLIST.includes(user.id)) {
			return;
		}
		const doRelay = (replyContent) => {
			const downstreams = this.getDownstreams(chan);
			for (const ochan of downstreams) {
				const processedMsg = this.convertMessage(
					chan, ochan, msg.content, msg.attachments
				);
				if (replyContent != null) {
					const processedReply = '> ' + this.convertMessage(
						chan, ochan, replyContent, []
					);
					this.relayMsg(chan, ochan, user, processedReply, true);
				}
				this.relayMsg(chan, ochan, user, processedMsg);
			}
		};
		if (msg.type == Message.TYPE_DISCORD) {
			const replyRef = msg.val.reference;
			if (replyRef != null && replyRef.messageId != null) {
				chan.val.messages.fetch(replyRef.messageId).then(
					(replyMsg) => {
						let replyNick = 'unknown';
						let isSelf = false;
						if (replyMsg.author != null) {
							const replyUser = new User(
								User.TYPE_DISCORD,
								replyMsg.author
							);
							isSelf = replyUser.getIsSelf(
								this.env.ircCli, this.env.discordCli
							);
							replyNick = replyUser.getNick(chan);
						}
						let replyStr = replyMsg.content;
						const openSqIndex = replyStr.indexOf('[');
						const closeSqIndex = replyStr.indexOf(']');
						const zwsIndex = replyStr.indexOf(ZWS);
						const botReplyDetect =
							openSqIndex == 0 &&
							closeSqIndex != -1 && zwsIndex != -1 &&
							openSqIndex < zwsIndex && zwsIndex < closeSqIndex;
						if (isSelf && botReplyDetect) {
							replyStr = `${replyStr.replace(ZWS, '')}`;
						}
						else {
							const nickPrepend = this.makeNickPrepend(chan, replyNick);
							replyStr = `${nickPrepend} ${replyStr}`;
						}
						doRelay(replyStr);
					}
				).catch(console.error);
				return;
			}
		}
		doRelay(null);
	}
	handleAction(user, chan, msg) {
		if (config.BLACKLIST.includes(user.id)) {
			return;
		}
		const downstreams = this.getDownstreams(chan);
		for (const ochan of downstreams) {
			const processedMsg = this.convertMessage(
				chan, ochan, msg, []
			);
			this.relayAction(chan, ochan, user, processedMsg);
		}
	}
	handleEdit(user, chan, msg) {
		if (config.BLACKLIST.includes(user.id)) {
			return;
		}
		if (user.getIsBot()) {
			return;
		}
		const downstreams = this.getDownstreams(chan);
		for (const ochan of downstreams) {
			const processedMsg = this.convertMessage(
				chan, ochan, msg.content, []
			);
			const c = '\x03';
			this.relayMsg(chan, ochan, user, processedMsg, false, true);
		}
	}
	ircDisableHighlight(nick) {
		if (nick.length < 2)
			return nick;
		return `${nick[0]}${ZWS}${nick.slice(1)}`
	}
	formatIrcNick(nick) {
		// const rcolors = [ 19, 20, 22, 24, 25, 26, 27, 28, 29 ];
		const rcolors = [ 3, 4, 6, 7, 9, 10, 12, 2, 13 ];
		let sum = 0;
		for (let i = 0; i < nick.length; i++) {
			sum += nick.charCodeAt(i);
		}
		const color = rcolors[sum % rcolors.length];
		const noHighlight = this.ircDisableHighlight(nick);
		const c = '\x03';
		return `${c}${color.toString().padStart(2, '0')}${colors.bold(noHighlight)}${c}`;
	}
	escapeSpecialChars(nick) {
		let escaped = '';
		for (const c of nick) {
			if ('-_[]{}\\`|'.indexOf(c) != -1) {
				escaped += `\\${c}`;
				continue;
			}
			escaped += c;
		}
		return escaped;
	}
	makeNickPrepend(chan, nick) {
		switch (chan.type) {
		case Channel.TYPE_IRC:
			return `[${this.formatIrcNick(nick)}]`;
		case Channel.TYPE_DISCORD:
			// prevent highlights in bridged discord replies
			const sanitizedNick = this.escapeSpecialChars(
				this.ircDisableHighlight(nick)
			);
			return `[**${sanitizedNick}**]`;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	relayAction(fromChan, toChan, user, msg) {
		const nick = user.getNick(fromChan);
		const nickPrepend = this.makeNickPrepend(toChan, nick);
		switch (toChan.type) {
		case Channel.TYPE_IRC:
			this.env.sendMessageNoBridge(
				toChan, `${nickPrepend} ${msg}`
			);
			break;
		case Channel.TYPE_DISCORD:
			this.env.sendMessageNoBridge(
				toChan, `${nickPrepend} *${msg}*`
			);
			break;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	relayEdit(fromChan, toChan, user, msg) {
		const nick = user.getNick(fromChan);
		const nickPrepend = this.makeNickPrepend(toChan, nick);
		switch (toChan.type) {
		case Channel.TYPE_IRC:
			this.env.sendMessageNoBridge(
				toChan, `${nickPrepend} ${msg}`
			);
			break;
		case Channel.TYPE_DISCORD:
			this.env.sendMessageNoBridge(
				toChan, `${nickPrepend} *${msg}*`
			);
			break;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	relayMsg(fromChan, toChan, user, msg, isReply = false, isEdit = false) {
		const nick = user.getNick(fromChan);
		const nickPrepend = this.makeNickPrepend(toChan, nick);
		if (isReply) {
			const line = `${nickPrepend} ${msg.split('\n').join(' ')}`;
			const lineSplit = line.substring(0, BridgePlugin.IRC_MSG_MAX_LEN);
			this.env.sendMessageNoBridge(
				toChan, lineSplit
			);
			return;
		}
		const c = '\x03';
		let editPrefix = isEdit ? `${c}15(edit)${c} ` : '';
		const decorateMessage = (processedMsg) => {
			return `${nickPrepend} ${editPrefix}${processedMsg}`;
		};
		const doSendMessage = (processedMsg) => {
			this.env.sendMessageNoBridge(
				toChan, decorateMessage(processedMsg)
			);
		};
		switch (toChan.type) {
		case Channel.TYPE_IRC:
			const lines = msg.split('\n');
			const needPastebin =
				lines.length > 5 || msg.length > BridgePlugin.IRC_MSG_MAX_LEN * 4;
			if (needPastebin) {
				uploadPybin(msg, (url) => {
					doSendMessage(`[ ${url} ]`);
				}, () => {
					doSendMessage(`[ error contacting pybin - long message omitted ]`);
				});
				break;
			}
			for (let line of lines) {
				// don't allow lines that are too long
				for (let i = 0; i < 4; i++) {
					if (line.length == 0)
						break;
					line = decorateMessage(line);

					// let lineSplit = line;
					let lineSplitLen = 0;
					let lineSplit = '';
					let rem = '';
					let hitLimit = false;
					for (const c of line) {
						if (hitLimit) {
							rem += c;
							continue;
						}

						const cLen = Buffer.from(c).length;
						if (lineSplitLen + cLen > BridgePlugin.IRC_MSG_MAX_LEN) {
							hitLimit = true;
							rem += c;
							continue;
						}

						lineSplitLen += cLen;
						lineSplit += c;
					}

					line = rem;
					this.env.sendMessageNoBridge(
						toChan, lineSplit
					);
				}
			}
			break;
		case Channel.TYPE_DISCORD:
			doSendMessage(msg);
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
		if (fromType == Channel.TYPE_IRC &&
				toType == Channel.TYPE_DISCORD) {
			msg = this.encodeDiscordUserMentions(msg, to);
			msg = to.escapeIrcStr(msg);
			msg = formatting.formatFromIRCToDiscord(msg);

			return msg;
		}
		if (fromType == Channel.TYPE_DISCORD &&
				toType == Channel.TYPE_IRC) {
			// msg = msg.replace(/\\([^a-zA-Z0-9\\s])/g, '$1');
			msg = formatting.formatFromDiscordToIRC(msg);
			msg = this.decodeDiscordUserMentions(msg, from);
			msg = this.decodeDiscordChannelMentions(msg, from);
			msg = this.decodeDiscordRoleMentions(msg, from);
			msg = this.decodeDiscordCustomEmoji(msg, from);

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
			const match = re.exec(msg);
			if (match == null) {
				newmsg += msg.substr(index);
				break;
			}
			if (match.length != 2)
				throw new Error('match should have length 2');

			const user = this.discordCli.users.cache.get(match[1]);
			if (user === undefined) {
				newmsg += msg.substring(index, re.lastIndex);
				index = re.lastIndex;
				continue;
			}
			const member = chan.val.guild.members.cache.get(user.id);
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
	decodeDiscordChannelMentions(msg, chan) {
		const re = BridgePlugin.CHANNEL_MENTION_REGEX;
		re.lastIndex = 0;
		let index = 0;
		let newmsg = '';
		for (;;) {
			const match = re.exec(msg);
			if (match == null) {
				newmsg += msg.substr(index);
				break;
			}
			if (match.length != 2)
				throw new Error('match should have length 2');

			const ochan = chan.val.guild.channels.cache.get(match[1]);
			if (ochan === undefined) {
				newmsg += msg.substring(index, re.lastIndex);
				index = re.lastIndex;
				continue;
			}

			newmsg += msg.substring(index, match.index);
			index = re.lastIndex;
			newmsg += `#${ochan.name}`;
		}
		return newmsg;
	}
	decodeDiscordRoleMentions(msg, chan) {
		const re = BridgePlugin.ROLE_MENTION_REGEX;
		re.lastIndex = 0;
		let index = 0;
		let newmsg = '';
		for (;;) {
			const match = re.exec(msg);
			if (match == null) {
				newmsg += msg.substr(index);
				break;
			}
			if (match.length != 2)
				throw new Error('match should have length 2');

			const role = chan.val.guild.roles.cache.get(match[1]);
			if (role === undefined) {
				newmsg += msg.substring(index, re.lastIndex);
				index = re.lastIndex;
				continue;
			}

			newmsg += msg.substring(index, match.index);
			index = re.lastIndex;
			newmsg += `@${role.name}`;
		}
		return newmsg;
	}
	decodeDiscordCustomEmoji(msg, chan) {
		const re = BridgePlugin.CUSTOM_EMOJI_REGEX;
		re.lastIndex = 0;
		let index = 0;
		let newmsg = '';
		for (;;) {
			const match = re.exec(msg);
			if (match == null) {
				newmsg += msg.substr(index);
				break;
			}
			if (match.length != 3)
				throw new Error('match should have length 3');

			newmsg += msg.substring(index, match.index);
			index = re.lastIndex;
			newmsg += `${match[1]}`;
		}
		return newmsg;
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
			if (match.length != 3)
				throw new Error('match should have length 5');

			const nick = (
				(match[1] === undefined) ? match[2] : match[1]
			).toLowerCase();
			if (config.MENTION_BLACKLIST.indexOf(nick) != -1) {
				newmsg += msg.substring(index, re.lastIndex);
				index = re.lastIndex;
				continue;
			}

			const lastChar = nick[nick.length - 1];
			const lastCharIsSymbol = /[^a-zA-Z0-9]/.test(lastChar);
			const nickMinusOne = nick.substring(0, nick.length - 1);
			let aliases = [{
				nick: nick,
				extra: '',
			}];
			if (lastCharIsSymbol) {
				aliases.push({
					nick: nickMinusOne,
					extra: lastChar,
				});
			}
			for (const aliasesCandidate of config.MENTION_ALIASES) {
				if (aliasesCandidate.indexOf(nick) != -1) {
					aliases = aliasesCandidate.map(alias => {return {
						nick: alias,
						extra: '',
					};});
					break;
				}
				if (
					lastCharIsSymbol &&
					aliasesCandidate.indexOf(nickMinusOne) != -1
				) {
					aliases = aliasesCandidate.map(alias => {return {
						nick: alias,
						extra: lastChar,
					};});
					break;
				}
			}

			let success = false;
			for (const alias of aliases) {
				const encoded = chan.encodeMention(alias.nick);
				if (encoded != null) {
					newmsg += msg.substring(index, match.index);
					newmsg += encoded + alias.extra;
					index = re.lastIndex;
					success = true;
					break;
				}
			}
			if (!success) {
				newmsg += msg.substring(index, re.lastIndex);
				index = re.lastIndex;
			}
		}
		return newmsg;
	}
	updateOnlineList(fromChan, toChan) {
		// fromChan has to be an irc channel,
		// toChan has to be a discord channel
		// note that there is a race condition here, but only the
		// first time this is called
		toChan.val.messages.fetchPinned().then(messages => {
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

BridgePlugin.CUSTOM_EMOJI_REGEX = new RegExp('<a?(:[^\\s:]+:)(\\d+)>', 'g');
BridgePlugin.USER_MENTION_REGEX = new RegExp('<@!?([0-9]+)>', 'g');
BridgePlugin.ROLE_MENTION_REGEX = new RegExp('<@&([0-9]+)>', 'g');
BridgePlugin.CHANNEL_MENTION_REGEX = new RegExp('<#([0-9]+)>', 'g');

// First half accepts colon-based pings at the start of a message.
// Second half accepts @-based pings anywhere in a message.
BridgePlugin.PLAIN_MENTION_REGEX = new RegExp('(?:^([^\\s:]+)[:]|(?<=^|\\s)@([^\\s]+))(?=\\s|$)', 'g');

BridgePlugin.IRC_MSG_MAX_LEN = 400;

module.exports = BridgePlugin;
