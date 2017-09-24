const path = require('path');

module.exports = {
    SERVER: 'irc.freenode.net',
    BOT_NICK: 'BOT_NICK',
    MY_NICK: 'YOUR_NICK',
    BOT_USERNAME: 'BOT_USERNAME',
    BOT_SASL_PASSWORD: 'p4ssw0rd',
    AUTOJOIN: [
        '#my-fav-channel'
    ],
    COMMAND_PREFIX: '::',
    CHANNEL_WHITELIST: [
        // AUTOJOIN channels automatically added here
        '##another-channel-not-autojoined'
    ],
    PERMISSION_GROUPS: [
        ['admin', ['YOUR_NICK']]
    ],
    PLUGINS_CONFIG: {
        GENERAL: {
            OBSERVATIONS_FILENAME: path.resolve(__dirname, 'db/observations.txt')
        }
    }
};
