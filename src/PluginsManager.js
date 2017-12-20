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

class PluginsManager {
    constructor(client){
        this.client = client;

        this.commandPrefix = config.COMMAND_PREFIX;

        // const whitelistArr = config.CHANNEL_WHITELIST;
        // if('AUTOJOIN' in config) whitelistArr.push(...config.AUTOJOIN);
        // this.whitelistedChannels = new Set(whitelistArr);

        this.permissions = new PermissionsManager();

        this.reloadSelf = () => {};

        this.plugins = new Map();
        this.reloadPlugins();
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
    handleMessage(from, to, message, messageData){
        for(const [pluginName, plugin] of this.plugins){
            if('handleMessage' in plugin){
                plugin.handleMessage(from, to, message);
            }
        }

        const inQuery = to == this.client.nick;
        const returnChannel = inQuery ? from : to;
        const isPrefixed = message.startsWith(this.commandPrefix);
        if(!isPrefixed && !inQuery) return false;
        // if(!inQuery && !this.whitelistedChannels.has(to)) return false;
        if(isPrefixed) message = message.substr(this.commandPrefix.length);

        console.log('<' + from + (inQuery ? '' : (':' + to)) + '> ' + message);
        for(const [pluginName, plugin] of this.plugins){
            const [cmd, argstring] = this.extractCmd(message);
            plugin.handleCommand(cmd, argstring, returnChannel, {
                sender: {
                    nick: messageData.nick,
                    username: messageData.user,
                    hostmask: messageData.host
                },
                inQuery: inQuery
            });
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
    sendMessage(channel, message){
        this.client.say(channel, message);
    }
    sendHighlight(channel, user, message){
        this.sendMessage(channel, user.nick + ': ' + message);
    }
};

module.exports = PluginsManager;
