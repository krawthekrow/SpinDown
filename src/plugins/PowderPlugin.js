const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const request = require('request');

const config = require('../../config.js').PLUGINS_CONFIG.POWDER;

const INIT_CACHE_SKELETON = {
    users: {
    },
    saves: {
    },
    tags: {
    }
};

const CACHE_FILENAME = config.CACHE_FILENAME;
if(!fs.existsSync(CACHE_FILENAME)){
    mkdirp(path.dirname(CACHE_FILENAME));
    fs.writeFileSync(CACHE_FILENAME, JSON.stringify(INIT_CACHE_SKELETON));
}
const CACHE = JSON.parse(fs.readFileSync(CACHE_FILENAME).toString());

class PowderPlugin {
    constructor(env){
        this.env = env;
        this.client = this.env.client;

        this.cache = CACHE;

        this.cmds = {
            'puser': (returnChannel, argstring, msgInfo) => {
                const user = argstring;
                this.getUserUpdates(user, (userUpdates) => {
                    for (let i = 0; i < userUpdates.length; i++) {
                        this.sendSave(returnChannel, userUpdates[i]);
                    }
                }, 4);
            },
        };
    }
    sendSave(returnChannel, save){
        const updatedType = (save.Created == save.Updated) ?
            'New' : 'Updated';
        this.env.sendMessage(returnChannel,
            `[${updatedType}: '${save.Name}' by ${save.Username}; http://tpt.io/~${save.ID}]`);
    }
    getUserUpdates(user, handleUpdates, maxUpdates=100){
        const searchReq =
            `http://powdertoythings.co.uk/Powder/Saves/Search.json?Search_Query=user%3A${user}`;
        request(searchReq, {
            json: true
        }, (err, resp, body) => {
            const res = [];
            if (err) {
                console.log(err);
                return false;
            }
            if (!(user in this.cache.users)) {
                this.cache.users[user] = 0;
            }
            for (let i = Math.min(body.Saves.length, maxUpdates) - 1;
                i >= 0; i--) {
                if (body.Saves[i].Updated >= this.cache.users[user]) {
                    res.push(body.Saves[i]);
                }
            }
            if (body.Saves.length > 0) {
                this.cache.users[user] = body.Saves[0].Updated;
            }
            this.updateCache();
            handleUpdates(res);
        });
    }
    updateCache(){
        fs.writeFileSync(CACHE_FILENAME, JSON.stringify(this.cache));
    }
    handleCommand(cmd, argstring, returnChannel, msgInfo){
        if(this.env.permissions.isAdmin(msgInfo.sender)){
            if(cmd in this.cmds){
                this.cmds[cmd](returnChannel, argstring, msgInfo);
            }
        }
    }
};

module.exports = PowderPlugin;
