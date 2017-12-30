const irc = require('irc');

const config = require('./config.js');

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
        pluginsManager = new pluginsManagerClass(client);
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
        console.log('Error handling message "' + message + '" from ' + from + ' to ' + to + ':');
        console.log(err);
    }
});
client.on('join', (channel, nick, message) => {
    console.log(nick + ' joined ' + channel + '.');
});
client.on('registered', (msg) => {
    console.log('Connected!');
});
