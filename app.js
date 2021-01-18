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
	const formattingFilename = './src/formatting.js';
	const patchedSMFilename = './src/PatchedSimpleMarkdown.js';
	delete require.cache[require.resolve(filename)];
	delete require.cache[require.resolve('./config.js')];
	delete require.cache[require.resolve('./src/PermissionsManager.js')];
	delete require.cache[require.resolve(userFilename)];
	delete require.cache[require.resolve(channelFilename)];
	delete require.cache[require.resolve(messageFilename)];
	delete require.cache[require.resolve(formattingFilename)];
	delete require.cache[require.resolve(patchedSMFilename)];
	try{
		const pluginsManagerClass = require(filename);
		pluginsManager = new pluginsManagerClass(ircCli, discordCli);
		pluginsManager.reloadSelf = reloadPluginsManager;
	}
	catch(err){
		console.error('Error reloading master module:');
		console.error(err);
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
	if (!pluginsManager)
		return;
	try{
		pluginsManager.handleDiscordMessage(msg);
	}
	catch(err){
		console.error(`Error handling message "${msg.content}" from ${msg.author.username} to ${msg.channel.name}:`);
		console.error(err);
	}
});
discordCli.on('messageUpdate', (oldMsg, msg) => {
	if (!pluginsManager)
		return;
	try{
		pluginsManager.handleDiscordEdit(oldMsg, msg);
	}
	catch(err){
		console.error(`Error handling message "${msg.content}" from ${msg.author.username} to ${msg.channel.name}:`);
		console.error(err);
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
	console.error('irc error');
	console.error(msg);
});
ircCli.addListener('message', (from, to, message, messageData) => {
	if (!pluginsManager)
		return;
	try{
		pluginsManager.handleIrcMessage(from, to, message, messageData);
	}
	catch(err){
		console.error(`Error handling message "${message}" from ${from} to ${to}:`);
		console.error(err);
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
