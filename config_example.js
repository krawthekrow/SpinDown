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
    CHANNEL_WHITELIST: [
        // AUTOJOIN channels automatically added here
        '##another-channel-not-autojoined'
    ],
    PERMISSION_GROUPS: [
        ['admin', [{
            username: 'YOUR_USERNAME',
            hostmask: 'YOUR_HOSTMASK' // e.g. unaffiliated/username
        }]]
    ],
    PLUGINS_CONFIG: {
        GENERAL: {
            OBSERVATIONS_FILENAME: path.resolve(__dirname, 'db/observations.txt')
        }
    }
};
