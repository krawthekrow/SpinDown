const config = require('../config.js');
const PermissionsManager = require('./PermissionsManager.js');

const PLUGIN_NAMES = new Map([
    ['reload', 'ReloadPlugin'],
    ['admin', 'AdminPlugin'],
    ['channel', 'ChannelManagementPlugin'],
    ['general', 'GeneralPlugin'],
    ['hangman', 'HangmanPlugin'],
    ['powder', 'PowderPlugin'],
    ['help', 'HelpPlugin']
]);

const ATTACK_REGEX = /^.attack\s*SpinDown\s*$/

class PluginsManager {
    constructor(client, discordCli){
        this.client = client;
        this.discordCli = discordCli;

        let bridgeIrcWhitelistArr = config.BOT_DISCORD_BRIDGE_IRC_WHITELIST;
        bridgeIrcWhitelistArr.push(config.BOT_DISCORD_BRIDGE_IRC_CHANNEL);
        this.bridgeIrcWhitelist = new Set(bridgeIrcWhitelistArr);

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
    tryInitDiscordChannel() {
        if (this.discordChannel != null)
            return true;
        this.discordChannel = this.discordCli.channels.get(
            config.BOT_DISCORD_BRIDGE_DISCORD_CHANNEL);
        return this.discordChannel != null;
    }
    reloadPlugins(){
        for(const [name, filename] of PLUGIN_NAMES){
            const fullFilename = './plugins/' + filename + '.js';
            delete require.cache[require.resolve(fullFilename)]
            try{
                const pluginClass = require(fullFilename);
                this.plugins.set(name, new pluginClass(this));
            }
            catch(err){
                console.log('Error reloading module ' + name + ':');
                console.log(err);
            }
        }
    }
    handleMessage(from, to, message, messageData, discord = false){
        if (!discord && this.tryInitDiscordChannel() && this.bridgeIrcWhitelist.has(to))
            this.sendDiscordMessage(`[${from}] ${message}`);

        for(const [pluginName, plugin] of this.plugins){
            if('handleMessage' in plugin){
                plugin.handleMessage(from, to, message);
            }
        }

        const inQuery = to == this.client.nick;
        const returnChannel = inQuery ? from : to;
        const isPrefixed = message.startsWith(this.commandPrefix);

        const msgInfo = {
            sender: {
                nick: messageData.nick,
                username: messageData.user,
                hostmask: messageData.host
            },
            inQuery: inQuery
        };
        if(isPrefixed) message = message.substr(this.commandPrefix.length);
        if(!isPrefixed && !inQuery) {
            if(message.match(ATTACK_REGEX)) {
                this.sendMessage(
                    returnChannel, '^attack ' + msgInfo.sender.nick);
                return true;
            }
            return false;
        }

        console.log('<' + from + (inQuery ? '' : (':' + to)) + '> ' + message);
        for(const [pluginName, plugin] of this.plugins){
            const [cmd, argstring] = this.extractCmd(message);
            plugin.handleCommand(cmd, argstring, returnChannel, msgInfo);
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
    printHelp(returnChannel, query, msgInfo){
        this.sendHighlight(returnChannel, msgInfo.sender,
            this.plugins.get('help').getHelp(query)
        );
    }
    sendAction(channel, message){
        this.client.action(channel, message);
    }
    sendNotice(channel, message){
        this.client.notice(channel, message);
    }
    sendMessage(channel, message){
        this.client.say(channel, message);
        if (channel == config.BOT_DISCORD_BRIDGE_IRC_CHANNEL)
            this.sendDiscordMessage(`[SpinDown] ${message}`);
    }
    sendDiscordMessage(message) {
        if (!this.tryInitDiscordChannel())
            return;
        const escaped = message.replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/~~/g, '\\~~');
        this.discordChannel.send(escaped);
    }
    sendHighlight(channel, user, message){
        if (channel == user.nick) {
            this.sendMessage(channel, message);
        }
        else {
            this.sendMessage(channel, user.nick + ': ' + message);
        }
    }
};

module.exports = PluginsManager;
