const config = require('../config.js');
const Channel = require('./Channel.js');

const PermissionsManager = require('./PermissionsManager.js');

const PLUGIN_NAMES = new Map([
    ['reload', 'ReloadPlugin'],
    ['admin', 'AdminPlugin'],
    ['channel', 'ChannelManagementPlugin'],
    ['general', 'GeneralPlugin'],
    ['hangman', 'HangmanPlugin'],
    ['powder', 'PowderPlugin'],
    ['bridge', 'BridgePlugin'],
    ['help', 'HelpPlugin']
]);

const ATTACK_REGEX = /^.attack\s*SpinDown\s*$/

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
    get user(chanType) {
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
            return this.discordCli.user;
            break;
        default:
            throw new Error('unrecognized channel type');
        }
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
    handleIrcMessage(from, to, message, messageData) {
        const userVal = new User.IrcUserData(
            messageData.nick,
            messageData.user,
            messageData.host
        );
        this.handleMessage(
            new User(User.TYPE_IRC, userVal),
            new Channel(
                Channel.TYPE_IRC,
                this.ircCli,
                to
            ),
            message
        );
    }
    handleDiscordMessage(msg) {
        this.handleMessage(
            new User(User.TYPE_DISCORD, msg.author),
            new Channel(
                Channel.TYPE_DISCORD,
                this.discordCli,
                msg.channel
            ),
            msg.content
        );
    }
    handleMessage(user, chan, msg) {
        for (const [pluginName, plugin] of this.plugins) {
            if ('handleMessage' in plugin) {
                plugin.handleMessage(user, chan, msg);
            }
        }
        let returnChannel = chan;
        if (chan.type == Channel.TYPE_IRC && chan.isQuery)
            returnChannel = new Channel(Channel.TYPE_IRC, user.nick);
        const isPrefixed = msg.startsWith(this.commandPrefix);

        if (isPrefixed) msg = msg.substr(this.commandPrefix.length);
        if (!isPrefixed && !chan.isQuery) {
            if (msg.match(ATTACK_REGEX)) {
                this.sendMessage(
                    returnChannel, '^attack ' + sender.nick
                );
                return true;
            }
            return false;
        }

        console.log(`<${user.name}${chan.isQuery ? '' : `:${chan.name}`}> ${msg}`);
        for(const [pluginName, plugin] of this.plugins){
            const [cmd, argstring] = this.extractCmd(msg);
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
            this.ircCli.action(chan, msg);
            break;
        case Channel.TYPE_DISCORD:
            // TODO: this
            break;
        default:
            throw new Error('unrecognized channel type');
        }
    }
    sendNotice(chan, msg){
        switch (chan.type) {
        case Channel.TYPE_IRC:
            this.ircCli.notice(chan, msg);
            break;
        case Channel.TYPE_DISCORD:
            // TODO: this
            break;
        default:
            throw new Error('unrecognized channel type');
        }
    }
    sendMessage(chan, msg){
        this.sendMessageNoBridge(chan, msg);
        this.plugins.get('bridge').handleMessage(this.user, chan, msg);
    }
    sendMessageNoBridge(chan, msg) {
        switch (chan.type) {
        case Channel.TYPE_IRC:
            this.ircCli.say(chan, msg);
            break;
        case Channel.TYPE_DISCORD:
            chan.send(msg);
            break;
        default:
            throw new Error('unrecognized channel type');
        }
    }
    sendHighlight(chan, user, msg){
        if (chan.isQuery(user)) {
            this.sendMessage(chan, msg);
            return;
        }

        this.sendMessage(chan, `${user.highlight} ${msg}`);
    }
    kick(chan, user) {
        switch (chan.type) {
        case Channel.TYPE_IRC:
            this.ircCli.send('kick', chan.val, sender.nick, 'YOU die!');
            break;
        case Channel.TYPE_DISCORD:
            // TODO: this
            this.sendMessage(chan, `SpinDown would like to kick ${sender.nick} but doesn't know how yet :(`);
            break;
        default:
            throw new Error('unrecognized channel type');
        }
    }
};

module.exports = PluginsManager;
