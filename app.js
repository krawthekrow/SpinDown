const irc = require('irc');
const Discord = require('discord.js');

const config = require('./config.js');

let ircCli = null;
let discordCli = null;

let pluginsManager = null;
const reloadPluginsManager = () => {
	if (pluginsManager != null) {
		pluginsManager.dispose();
	}
	const filename = './src/PluginsManager.js';
	const userFilename = './src/User.js';
	const channelFilename = './src/Channel.js';
	const messageFilename = './src/Message.js';
	delete require.cache[require.resolve(filename)];
	delete require.cache[require.resolve('./config.js')];
	delete require.cache[require.resolve('./src/PermissionsManager.js')];
	delete require.cache[require.resolve(userFilename)];
	delete require.cache[require.resolve(channelFilename)];
	delete require.cache[require.resolve(messageFilename)];
	try{
		const pluginsManagerClass = require(filename);
		pluginsManager = new pluginsManagerClass(ircCli, discordCli);
		pluginsManager.reloadSelf = reloadPluginsManager;
	}
	catch(err){
		console.log('Error reloading master module:');
		console.log(err);
	}
};

let discordConnected = false;
let ircConnected = false;
function onClientConnect() {
	if (!discordConnected || !ircConnected)
		return;
	reloadPluginsManager();
}

discordCli = new Discord.Client();

discordCli.on('ready', () => {
	console.log(`Connected to Discord as ${discordCli.user.tag}!`);
	discordConnected = true;
	onClientConnect();
});

discordCli.on('message', msg => {
	try{
		pluginsManager.handleDiscordMessage(msg);
	}
	catch(err){
		console.log(`Error handling message "${msg.content}" from ${msg.author.username} to ${msg.channel.name}:`);
		console.log(err);
	}
});

if ('BOT_DISCORD_TOKEN' in config) {
	discordCli.login(config.BOT_DISCORD_TOKEN);
}

const ircConfig = {
	userName: config.BOT_USERNAME,
	realName: config.BOT_REALNAME,
	password: config.BOT_SASL_PASSWORD,
	retryCount: 0,
	autoRejoin: true
};

if('PORT' in config) ircConfig.port = config.PORT;
if('SECURE' in config) ircConfig.secure = config.SECURE;
if('SELF_SIGNED' in config) ircConfig.selfSigned = config.SELF_SIGNED;
if('AUTOJOIN' in config) ircConfig.channels = config.AUTOJOIN;

ircCli = new irc.Client(config.SERVER, config.BOT_NICK, ircConfig);

ircCli.on('error', (msg) => {
	console.log(msg);
});
ircCli.addListener('message', (from, to, message, messageData) => {
	if (!pluginsManager)
		return;
	try{
		pluginsManager.handleIrcMessage(from, to, message, messageData);
	}
	catch(err){
		console.log(`Error handling message "${message}" from ${from} to ${to}:`);
		console.log(err);
	}
});
ircCli.on('join', (channel, nick, messageData) => {
	if (!pluginsManager)
		return;
	pluginsManager.handleIrcJoin(channel, nick, messageData);
});
ircCli.on('part', (channel, nick, reason, messageData) => {
	if (!pluginsManager)
		return;
	pluginsManager.handleIrcPart(channel, nick, reason, messageData);
});
ircCli.on('quit', (nick, reason, channels, messageData) => {
	if (!pluginsManager)
		return;
	pluginsManager.handleIrcQuit(nick, reason, channels, messageData);
});
ircCli.on('nick', (oldNick, newNick, channels, messageData) => {
	if (!pluginsManager)
		return;
	pluginsManager.handleIrcNickChange(oldNick, newNick, channels, messageData);
});
ircCli.on('action', (from, to, message, messageData) => {
	if (!pluginsManager)
		return;
	pluginsManager.handleIrcAction(from, to, message, messageData);
});
ircCli.on('registered', (msg) => {
	console.log('Connected to IRC!');
	ircConnected = true;
});
