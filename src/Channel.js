class Channel {
    constructor(type, val) {
        this.type = type;
        this.val = val;
    }
    get isQuery(user = null) {
        let isQuery = false;
        switch (this.type) {
        case Channel.TYPE_IRC:
            isQuery = this.val == this.val.client.nick;
            break;
        case Channel.TYPE_DISCORD:
            isQuery = this.val.type == 'dm';
            break;
        default:
            throw new Error('unrecognized channel type');
        }
        if (user == null)
            return isQuery;

        if (this.type != user.type)
            return false;
        switch (this.type) {
        case Channel.TYPE_IRC:
            return this.val == user.nick;
        case Channel.TYPE_DISCORD:
            return this.val.recipient.id == user.id;
        default:
            throw new Error('unrecognized channel type');
        }
    }
    get name() {
        switch (this.type) {
        case Channel.TYPE_IRC:
            return this.val;
        case Channel.TYPE_DISCORD:
            return this.val.name;
        default:
            throw new Error('unrecognized channel type');
        }
    }
    get id() {
        switch (this.type) {
        case Channel.TYPE_IRC:
            return `irc:${this.val}`;
        case Channel.TYPE_DISCORD:
            return `discord:${this.val.id}`;
        default:
            throw new Error('unrecognized channel type');
        }
    }
    static equal(chan1, chan2) {
        if (chan1.type != chan2.type)
            return false;
        switch (chan1.type) {
        case Channel.TYPE_IRC:
            return chan1.val == chan2.val;
        case Channel.TYPE_DISCORD:
            return chan1.id == chan2.id;
        default:
            throw new Error('unrecognized channel type');
        }
    }
    static fromString(str, ircCli, discordCli) {
        let match;
        match = Channel.REGEX_IRC.exec(str);
        if (match != null) {
            if (match.length != 2)
                throw new Error('expected match of length 2');
            return new Channel(Channel.TYPE_IRC, match[1]);
        }
        match = Channel.REGEX_DISCORD.exec(str);
        if (match != null) {
            if (match.length != 3)
                throw new Error('expected match of length 3');
            const val = discordCli.find(chan => {
                return (
                    chan.guild.name == match[1] &&
                    chan.name == match[2]
                );
            });
            if (val === undefined)
                throw new Error('could not find discord channel');
            return new Channel(Channel.TYPE_DISCORD, val);
        }
        throw new Error('could not parse channel type');
    }
};

Channel.REGEX_IRC = /^irc:(.*)$/;
Channel.REGEX_DISCORD = /^discord:([^#]*)#(.*)$/;

Channel.TYPE_IRC = 0;
Channel.TYPE_DISCORD = 1;

module.exports = Channel;
