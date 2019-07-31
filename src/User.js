class IrcUserData {
    constructor(nick, username, hostmask) {
        this.nick = nick;
        this.tag = `${username}@${hostmask}`;
    }
};

class User {
    constructor(type, val) {
        this.type = type;
        this.val = val;
    }
    get highlight() {
        switch(this.type) {
        case User.TYPE_IRC:
            return `${this.nick}:`;
        case User.TYPE_DISCORD:
            return `<@${this.val.id}>`;
        default:
            throw new Error('unrecognized user type');
        }
    }
    get nick() {
        switch(this.type) {
        case User.TYPE_IRC:
            return this.val.nick;
        case User.TYPE_DISCORD:
            return this.val.username;
        default:
            throw new Error('unrecognized user type');
        }
    }
    // this is guaranteed to be unique
    get id() {
        switch(this.type) {
        case User.TYPE_IRC:
            return `irc:${this.val.tag}`;
        case User.TYPE_DISCORD:
            return `discord:${this.val.tag}`;
        default:
            throw new Error('unrecognized user type');
        }
    }
};

User.TYPE_IRC = 0;
User.TYPE_DISCORD = 1;

User.IrcUserData = IrcUserData;

module.exports = User;
