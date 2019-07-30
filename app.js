const irc = require('irc');
const Discord = require('discord.js');

const config = require('./config.js');

const discordCli = new Discord.Client();
let discordConnected = false;
let discordChannel = null;
let ircConnected = false;

let discordWhitelistArr = config.BOT_DISCORD_BRIDGE_DISCORD_WHITELIST;
discordWhitelistArr.push(config.BOT_DISCORD_BRIDGE_DISCORD_CHANNEL);
const discordWhitelist = new Set(discordWhitelistArr);

discordCli.on('ready', () => {
    console.log(`Connected to Discord as ${discordCli.user.tag}!`);
    discordConnected = true;
    discordChannel = discordCli.channels.get(config.BOT_DISCORD_BRIDGE_DISCORD_CHANNEL);
});

discordCli.on('message', msg => {
    try{
        if (ircConnected && msg.author != discordCli.user) {
            if (discordWhitelist.has(msg.channel.id)) {
                client.say(config.BOT_DISCORD_BRIDGE_IRC_CHANNEL, `[${msg.author.username}] ${msg.content}`);
            }

            if (msg.channel.type == 'dm') {
                msg.channel.send(`Sorry, I don't support DMs on Discord. Try IRC instead!`);
                return;
            }
            if (msg.channel.id != config.BOT_DISCORD_BRIDGE_DISCORD_CHANNEL) {
                return;
            }
            const msgData = {
                nick: msg.author.username,
                username: msg.author.tag,
                host: 'discord',
            };
            pluginsManager.handleMessage(msg.author.username, config.BOT_DISCORD_BRIDGE_IRC_CHANNEL, msg.content, msgData, true);
        }
    }
    catch(err){
        console.log(`Error handling message "${msg.content}" from ${msg.author.username} to ${msg.channel.name}:`);
        console.log(err);
    }
});

if ('BOT_DISCORD_TOKEN' in config) {
    discordCli.login(config.BOT_DISCORD_TOKEN);
}

const clientConfig = {
    userName: config.BOT_USERNAME,
    realName: config.BOT_REALNAME,
    password: config.BOT_SASL_PASSWORD,
    retryCount: 0,
    autoRejoin: true
};

if('PORT' in config) clientConfig.port = config.PORT;
if('SECURE' in config) clientConfig.secure = config.SECURE;
if('SELF_SIGNED' in config) clientConfig.selfSigned = config.SELF_SIGNED;
if('AUTOJOIN' in config) clientConfig.channels = config.AUTOJOIN;

const client = new irc.Client(config.SERVER, config.BOT_NICK, clientConfig);

let pluginsManager = null;
const reloadPluginsManager = () => {
    if (pluginsManager != null) {
        pluginsManager.dispose();
    }
    const filename = './src/PluginsManager.js';
    delete require.cache[require.resolve(filename)];
    delete require.cache[require.resolve('./config.js')];
    try{
        const pluginsManagerClass = require(filename);
        pluginsManager = new pluginsManagerClass(client, discordCli);
        pluginsManager.reloadSelf = reloadPluginsManager;
    }
    catch(err){
        console.log('Error reloading master module:');
        console.log(err);
    }
};
reloadPluginsManager();

client.on('error', (msg) => {
    console.log(msg);
});
client.addListener('message', (from, to, message, messageData) => {
    try{
        pluginsManager.handleMessage(from, to, message, messageData);
    }
    catch(err){
        console.log(`Error handling message "${message}" from ${from} to ${to}:`);
        console.log(err);
    }
});
client.on('join', (channel, nick, message) => {
    console.log(nick + ' joined ' + channel + '.');
});
client.on('registered', (msg) => {
    console.log('Connected to IRC!');
    ircConnected = true;
});
