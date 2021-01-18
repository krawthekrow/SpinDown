const config = require('../config.js');
const Channel = require('./Channel.js');
const User = require('./User.js');
const Message = require('./Message.js');

const PermissionsManager = require('./PermissionsManager.js');

const PLUGIN_NAMES = new Map([
	['reload', 'ReloadPlugin'],
	['admin', 'AdminPlugin'],
	['channel', 'ChannelManagementPlugin'],
	['general', 'GeneralPlugin'],
	['hangman', 'HangmanPlugin'],
	['powder', 'PowderPlugin'],
	['bridge', 'BridgePlugin'],
	['eat', 'EatPlugin'],
	['help', 'HelpPlugin']
]);

class PluginsManager {
	constructor(ircCli, discordCli){
		this.ircCli = ircCli;
		this.discordCli = discordCli;

		this.commandPrefix = config.COMMAND_PREFIX;

		this.permissions = new PermissionsManager();

		this.reloadSelf = () => {};

		this.plugins = new Map();
		this.reloadPlugins();
	}
	dispose(){
		for(const [pluginName, plugin] of this.plugins){
			if('dispose' in plugin){
				plugin.dispose();
			}
		}
	}
	reloadPlugins(){
		for(const [name, filename] of PLUGIN_NAMES){
			const fullFilename = './plugins/' + filename + '.js';
			delete require.cache[require.resolve(fullFilename)]
			try {
				const pluginClass = require(fullFilename);
				this.plugins.set(name, new pluginClass(this));
			}
			catch(err) {
				console.log('Error reloading module ' + name + ':');
				console.log(err);
			}
		}
	}
	getCli(type) {
		switch (type) {
		case Channel.TYPE_IRC:
			return this.ircCli;
		case Channel.TYPE_DISCORD:
			return this.discordCli;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	getUser(chanType) {
		switch (chanType) {
		case Channel.TYPE_IRC:
			return new User(
				User.TYPE_IRC,
				new User.IrcUserData(
					config.BOT_NICK,
					config.BOT_USERNAME,
					config.BOT_HOSTMASK
				)
			);
		case Channel.TYPE_DISCORD:
			return new User(
				User.TYPE_DISCORD,
				this.discordCli.user
			);
		default:
			throw new Error('unrecognized channel type');
		}
	}
	parseChanFromUser(type, name, returnChan, sender) {
		const chan = Channel.findByFullName(
			type, this.ircCli, this.discordCli, name
		);
		if (chan != null)
			return chan;
		if (type == Channel.TYPE_DISCORD && name[0] == '#') {
			this.sendHighlight(
				returnChan,
				sender,
				`Please specify which server ${name} is on.`
			);
			return null;
		}
		this.sendHighlight(
			returnChan,
			sender,
			`I don't recognize ${name}.`
		);
		return null;
	}
	makeIrcUser(messageData) {
		return new User(User.TYPE_IRC, new User.IrcUserData(
			messageData.nick,
			messageData.user,
			messageData.host
		));
	}
	makeIrcChannel(chan) {
		return new Channel(
			Channel.TYPE_IRC,
			new Channel.IrcChannelData(
				chan, this.ircCli
			)
		);
	}
	handleIrcMessage(from, to, message, messageData) {
		this.handleMessage(
			this.makeIrcUser(messageData),
			this.makeIrcChannel(to),
			new Message(Message.TYPE_IRC, message)
		);
	}
	handleDiscordMessage(msg) {
		let user = msg.author;
		this.handleMessage(
			new User(User.TYPE_DISCORD, user),
			new Channel(
				Channel.TYPE_DISCORD,
				msg.channel
			),
			new Message(Message.TYPE_DISCORD, msg)
		);
	}
	handleDiscordEdit(oldMsg, msg) {
		if (msg.content.trim().length == 0)
			return;
		if (oldMsg.content == msg.content)
			return;
		let user = msg.author;
		this.handleEdit(
			new User(User.TYPE_DISCORD, user),
			new Channel(
				Channel.TYPE_DISCORD,
				msg.channel
			),
			new Message(Message.TYPE_DISCORD, msg)
		);
	}
	handleIrcJoin(chan, nick, messageData) {
		this.plugins.get('bridge').handleIrcJoin(
			this.makeIrcUser(messageData),
			this.makeIrcChannel(chan)
		);
	}
	handleIrcPart(chan, nick, reason, messageData) {
		this.plugins.get('bridge').handleIrcPart(
			this.makeIrcUser(messageData),
			this.makeIrcChannel(chan)
		);
	}
	handleIrcQuit(nick, reason, chans, messageData) {
		for (const chan of chans) {
			this.plugins.get('bridge').handleIrcQuit(
				this.makeIrcUser(messageData),
				this.makeIrcChannel(chan)
			);
		}
	}
	handleIrcNickChange(oldNick, newNick, chans, messageData) {
		for (const chan of chans) {
			this.plugins.get('bridge').handleIrcNickChange(
				this.makeIrcUser(messageData),
				this.makeIrcChannel(chan),
				newNick
			);
		}
	}
	handleIrcAction(from, to, message, messageData) {
		this.handleAction(
			this.makeIrcUser(messageData),
			this.makeIrcChannel(to),
			new Message(Message.TYPE_IRC, message)
		);
	}
	handleEdit(user, chan, msg) {
		if (User.equal(this.getUser(chan.type), user))
			return false;
		for (const [pluginName, plugin] of this.plugins) {
			if ('handleEdit' in plugin)
				plugin.handleEdit(user, chan, msg);
		}
	}
	handleAction(user, chan, msg) {
		if (User.equal(this.getUser(chan.type), user))
			return false;
		for (const [pluginName, plugin] of this.plugins) {
			if ('handleAction' in plugin)
				plugin.handleAction(user, chan, msg.content);
		}
	}
	handleMessage(user, chan, msg) {
		if (User.equal(this.getUser(chan.type), user))
			return false;
		for (const [pluginName, plugin] of this.plugins) {
			if ('handleFullMessage' in plugin)
				plugin.handleFullMessage(user, chan, msg);
			if ('handleMessage' in plugin)
				plugin.handleMessage(user, chan, msg.content);
		}

		const returnChannel = Channel.getReplyChan(chan, user);
		let cmdStr = msg.content;
		const isPrefixed = cmdStr.startsWith(this.commandPrefix);
		if (isPrefixed) cmdStr = cmdStr.substr(this.commandPrefix.length);
		if (!isPrefixed && !chan.isQuery)
			return false;

		console.log(`<${user.getNick(chan)}${chan.isQuery ? '' : `:${chan.fullName}`}> ${cmdStr}`);
		for(const [pluginName, plugin] of this.plugins){
			const [cmd, argstring] = this.extractCmd(cmdStr);
			if ('handleCommand' in plugin)
				plugin.handleCommand(cmd, argstring, returnChannel, user);
		}
		return true;
	}
	extractCmd(message){
		const firstSpaceIndex = message.indexOf(' ');
		let cmd = message, argstring = '';
		if(firstSpaceIndex != -1){
			cmd = message.substring(0, firstSpaceIndex);
			argstring = message.substring(firstSpaceIndex + 1);
		}
		return [cmd, argstring];
	}
	printHelp(returnChannel, query, sender){
		this.sendHighlight(returnChannel, sender,
			this.plugins.get('help').getHelp(query)
		);
	}
	sendAction(chan, msg){
		switch (chan.type) {
		case Channel.TYPE_IRC:
			this.ircCli.action(chan.name, msg);
			break;
		case Channel.TYPE_DISCORD:
			this.sendMessage(chan, `_SpinDown ${msg}_`);
			break;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	sendNotice(user, msg){
		switch (user.type) {
		case User.TYPE_IRC:
			this.ircCli.notice(user.val.nick, msg);
			break;
		case Channel.TYPE_DISCORD:
			this.sendMessage(Channel.getDmChan(this.ircCli, this.discordCli, user), msg);
			break;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	sendMessage(chan, msg){
		console.log(`<${config.BOT_NICK}:${chan.fullName}> ${msg}`);
		this.sendMessageNoBridge(chan, msg);
		this.plugins.get('bridge').handleInternalMessage(
			this.getUser(chan.type), chan, msg
		);
	}
	sendMessageNoBridge(chan, msg) {
		switch (chan.type) {
		case Channel.TYPE_IRC:
			// remove bell characters
			msg = msg.replace('\x07', '');
			// remove CTCP markers
			msg = msg.replace('\x01', '');
			this.ircCli.say(chan.name, msg);
			break;
		case Channel.TYPE_DISCORD:
			chan.val.send(msg);
			break;
		default:
			throw new Error('unrecognized channel type');
		}
	}
	sendHighlight(chan, user, msg){
		if (chan.isQueryTo(user)) {
			this.sendMessage(chan, msg);
			return;
		}

		this.sendMessage(chan, `${user.highlight} ${msg}`);
	}
	kick(chan, user) {
		switch (chan.type) {
		case Channel.TYPE_IRC:
			this.ircCli.send('kick', chan.name, sender.getNick(chan), 'YOU die!');
			break;
		case Channel.TYPE_DISCORD:
			// TODO: this
			this.sendMessage(chan, `SpinDown would like to kick ${sender.getNick(chan)} but doesn't know how yet :(`);
			break;
		default:
			throw new Error('unrecognized channel type');
		}
	}
};

module.exports = PluginsManager;
