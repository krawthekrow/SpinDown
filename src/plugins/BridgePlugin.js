const config = require('../../config.js').PLUGINS.BRIDGE;
const Channel = require('../Channel.js');

class Bridge {
    constructor(env) {
        this.env = env;
        this.client = this.env.client;

        this.links = [];
        for (const linkSpec of config.LINKS) {
            let link = [];
            for (const chanSpec of linkSpec) {
                link.push(Channel.fromString(chanSpec));
            }
            this.links.push(link);
        }
    }
    handleMessage(user, chan, msg) {
        for (const link of this.links) {
            let inLink = false;
            for (const ochan of link) {
                if (Channel.equal(chan, ochan)) {
                    inLink = true;
                    break;
                }
            }
            if (!inLink)
                continue;
            for (const ochan of link) {
                if (Channel.equal(chan, ochan))
                    continue;
                const newMsg = Bridge.convertMessage(
                    chan.type, ochan.type, msg
                );
                this.env.sendMessageNoBridge(
                    ochan, `[${user.nick}] ${newMsg}`
                );
            }
        }
    }
    static convertMessage(fromType, toType, msg) {
        if (fromType == toType)
            return msg;
        // TODO: this
        if (fromType == Channel.TYPE_IRC &&
                toType == Channel.TYPE_DISCORD) {
            const escaped = msg.replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/~~/g, '\\~~');
            return escaped;
        }
        return msg;
    }
};

module.exports = Bridge;
