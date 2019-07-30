const path = require('path');

module.exports = {
    SERVER: 'irc.freenode.net',
    PORT: 6667, // optional
    SECURE: false, // optional
    SELF_SIGNED: false, // optional
    BOT_NICK: 'BOT_NICK',
    MY_NICK: 'YOUR_NICK',
    BOT_REALNAME: 'BOT_REALNAME',
    BOT_USERNAME: 'BOT_USERNAME',
    BOT_SASL_PASSWORD: 'p4ssw0rd',
    AUTOJOIN: [
        '#my-fav-channel'
    ], // optional
    COMMAND_PREFIX: '::',
    PERMISSION_GROUPS: [
        ['admin', [{
            username: 'YOUR_USERNAME',
            hostmask: 'YOUR_HOSTMASK' // e.g. unaffiliated/username
        }]]
    ],
    BOT_DISCORD_TOKEN: 'YOUR_TOKEN', // optional
    BOT_DISCORD_BRIDGE_IRC_CHANNEL: '#channel', // goes with BOT_DISCORD_TOKEN
    BOT_DISCORD_BRIDGE_DISCORD_CHANNEL: 'channel-id', // goes with BOT_DISCORD_TOKEN
    BOT_DISCORD_BRIDGE_IRC_WHITELIST: [
        // BOT_DISCORD_BRIDGE_IRC_CHANNEL automatically added to whitelist
    ],
    BOT_DISCORD_BRIDGE_DISCORD_WHITELIST: [
        // BOT_DISCORD_BRIDGE_DISCORD_CHANNEL automatically added to whitelist
    ],
    PLUGINS_CONFIG: {
        GENERAL: {
            OBSERVATIONS_FILENAME:
                path.resolve(__dirname, 'db/observations.txt')
        },
        HANGMAN: {
            WORDLIST_FILENAME:
                path.resolve(__dirname, 'db/wordlist_long.txt')
        },
        POWDER: {
            CACHE_FILENAME: path.resolve(__dirname, 'db/powder_cache.txt'),
            WATCH_FILENAME:
                path.resolve(__dirname, 'db/powder_watch.txt'),
            UPDATE_MIN_INTERVAL: 10 * 1000
        }
    },
};
