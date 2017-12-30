const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const request = require('request');

const config = require('../../config.js').PLUGINS_CONFIG.POWDER;

const UPDATE_MIN_INTERVAL = config.UPDATE_MIN_INTERVAL;

const INIT_CACHE_SKELETON = {
    users: {},
    comments: {},
    subframe: {}
};

const INIT_WATCH_SKELETON = {
    users: {},
    comments: {}
};

const CACHE_FILENAME = config.CACHE_FILENAME;
if(!fs.existsSync(CACHE_FILENAME)){
    mkdirp(path.dirname(CACHE_FILENAME));
    fs.writeFileSync(CACHE_FILENAME, JSON.stringify(INIT_CACHE_SKELETON));
}
const CACHE = JSON.parse(fs.readFileSync(CACHE_FILENAME).toString());

const WATCH_FILENAME = config.WATCH_FILENAME;
if(!fs.existsSync(WATCH_FILENAME)){
    mkdirp(path.dirname(WATCH_FILENAME));
    fs.writeFileSync(WATCH_FILENAME,
        JSON.stringify(INIT_WATCH_SKELETON));
}
const WATCH = JSON.parse(fs.readFileSync(WATCH_FILENAME).toString());

class PowderPlugin {
    constructor(env){
        this.env = env;
        this.client = this.env.client;

        this.cache = CACHE;
        this.watch = WATCH;

        this.cmds = {
            'puser': (returnChannel, argstring, msgInfo) => {
                // Testing command, don't use
                const user = argstring;
                if (user == '') {
                    this.env.sendHighlight(returnChannel, msgInfo.sender,
                        'Please provide a username.');
                    return;
                }
                if (!this.isValidUsername(user)) {
                    this.env.sendHighlight(returnChannel, msgInfo.sender,
                        'Invalid username!');
                    return;
                }
                this.getUserUpdates([user], (userUpdates) => {
                    for (let i = 0; i < userUpdates.length; i++) {
                        this.sendSave(returnChannel, userUpdates[i]);
                    }
                }, 4);
            },
            'pwatchadd': (returnChannel, argstring, msgInfo) => {
                if (argstring == '') {
                    this.env.sendHighlight(returnChannel, msgInfo.sender,
                        'Please provide a user to watch.');
                    return;
                }
                const users = argstring.split(' ');
                const senderNick = msgInfo.sender.nick;
                for (const user of users) {
                    if (!this.isValidUsername(user)) {
                        this.env.sendHighlight(
                            returnChannel, msgInfo.sender,
                            `Invalid username: ${user}`);
                        return;
                    }
                }
                for (const user of users) {
                    if (!(user in this.watch.users)) {
                        this.watch.users[user] = {};
                    }
                    this.watch.users[user][senderNick] = true;
                }
                this.saveWatch();
                this.env.sendHighlight(returnChannel, msgInfo.sender,
                    'Watch added!');
            },
            'pwatchrem': (returnChannel, argstring, msgInfo) => {
                const users = argstring.split(' ');
                const senderNick = msgInfo.sender.nick;
                let numWatchesRemoved = 0;
                for (const user of users) {
                    if ((user in this.watch.users) &&
                        (senderNick in this.watch.users[user])) {
                        delete this.watch.users[user][senderNick];
                        numWatchesRemoved++;
                    }
                    else{
                        this.env.sendHighlight(
                            returnChannel, msgInfo.sender,
                            user + ' isn\'t not on your watchlist!');
                    }
                }
                this.saveWatch();
                this.env.sendHighlight(returnChannel, msgInfo.sender,
                    numWatchesRemoved.toString() + ' watches removed!');
                return;
            },
            'pwatchlist': (returnChannel, argstring, msgInfo) => {
                const senderNick = msgInfo.sender.nick;
                const query = (argstring == '') ? senderNick : argstring;
                const watchList = [];
                for (const user in this.watch.users) {
                    if (query in this.watch.users[user]) {
                        watchList.push(user);
                    }
                }
                this.env.sendHighlight(returnChannel, msgInfo.sender,
                    (watchList.length > 0) ? watchList.join(', ') :
                    'Watchlist empty!');
            },
            'pcacheclear': (returnChannel, argstring, msgInfo) => {
                if(this.env.permissions.isAdmin(msgInfo.sender)){
                    if (argstring == 'subframe') {
                        this.cache.subframe = {};
                    }
                    else {
                        this.cache = INIT_CACHE_SKELETON;
                    }
                    this.saveCache();
                    this.env.sendHighlight(returnChannel, msgInfo.sender,
                        'Cache cleared!');
                }
            },
            'pwatchclear': (returnChannel, argstring, msgInfo) => {
                if (argstring == 'all') {
                    if(this.env.permissions.isAdmin(msgInfo.sender)){
                        this.watch = INIT_WATCH_SKELETON;
                        this.saveWatch();
                        this.env.sendHighlight(
                            returnChannel, msgInfo.sender,
                            'All watchlists cleared!');
                    }
                    return;
                }
                const senderNick = msgInfo.sender.nick;
                for (const user in this.watch.users) {
                    if (senderNick in this.watch.users[user]) {
                        delete this.watch.users[user][senderNick];
                    }
                }
                this.env.sendHighlight(returnChannel, msgInfo.sender,
                    'Watchlist cleared!');
            },
            'pcommentwatch': (returnChannel, argstring, msgInfo) => {
                const senderNick = msgInfo.sender.nick;
                const username = argstring;
                if (username == '') {
                    this.env.sendHighlight(returnChannel, msgInfo.sender,
                        'Please provide your TPT username.');
                    return;
                }
                const deleteMode = username == '@stop';
                if (!deleteMode) {
                    if (!this.isValidUsername(username)) {
                        this.env.sendHighlight(
                            returnChannel, msgInfo.sender,
                            'Invalid username!');
                        return;
                    }
                    if (!(username in this.watch.comments)) {
                        this.watch.comments[username] = {};
                    }
                    if (senderNick in this.watch.comments[username]) {
                        this.env.sendHighlight(
                            returnChannel, msgInfo.sender,
                            'You already have comment watch enabled!');
                        return;
                    }
                    this.watch.comments[username][senderNick] = true;
                }
                let commentWatchesFound = 0;
                for (const oUsername in this.watch.comments) {
                    if (!deleteMode && username == oUsername) {
                        continue;
                    }
                    if (senderNick in this.watch.comments[oUsername]) {
                        delete this.watch.comments[oUsername][senderNick];
                        commentWatchesFound++;
                        if (Object.keys(
                            this.watch.comments[oUsername]).length == 0) {

                            delete this.watch.comments[oUsername];
                        }
                    }
                }
                if (deleteMode && commentWatchesFound == 0) {
                    this.env.sendHighlight(
                        returnChannel, msgInfo.sender,
                        'You don\'t have comment watch enabled!');
                    return;
                }
                this.saveWatch();
                this.env.sendHighlight(returnChannel, msgInfo.sender,
                    deleteMode ? 'Comment watch disabled.' :
                        'Comment watch enabled.');
            },
        };
        this.taskList = [];
        this.currTaskIndex = 0;
        this.currCommentsSweepPage = 0;
        this.updateTimeout = null;
        this.active = true;
        this.refreshTaskList();
        this.update();
    }
    dispose(){
        if (this.updateTimeout != null) {
            clearTimeout(this.updateTimeout);
        }
        this.active = false;
    }
    update(){
        this.prevUpdateStart = new Date().getTime();
        setImmediate(() => {
            this.doTask();
        });
    }
    doTask(){
        if (!this.active) return;
        if (this.currTaskIndex == this.taskList.length) {
            this.currTaskIndex = 0;
            this.refreshTaskList();
            const nextUpdateStart =
                this.prevUpdateStart + UPDATE_MIN_INTERVAL;
            let sleepInterval = nextUpdateStart - new Date().getTime();
            if (sleepInterval < 0) sleepInterval = 0;
            this.updateTimeout = setTimeout(() => {
                this.update();
            }, sleepInterval);
            return;
        }
        const currTask = this.taskList[this.currTaskIndex];
        this.currTaskIndex++;
        switch(currTask.type) {
        case 'user': {
            const users = Object.keys(this.watch.users);
            this.getUserUpdates(users, (userUpdates) => {
                for (let i = 0; i < userUpdates.length; i++) {
                    const user = userUpdates[i].Username;
                    const watchers = this.watch.users[user];
                    for (const watcher in watchers) {
                        this.sendSave(watcher, userUpdates[i]);
                    }
                }
                setImmediate(() => {
                    this.doTask();
                });
            });
            break;
        }
        case 'subframe':
            this.getSubframeUpdates(() => {
                setImmediate(() => {
                    this.doTask();
                });
            });
            break;
        case 'fp':
            this.getFpUpdates((fpUpdates) => {
                for (const save of fpUpdates) {
                    this.env.sendMessage('#powder-subframe',
                        `[Subframe FP Update: http://tpt.io/~${save.ID}]`);
                }
                setImmediate(() => {
                    this.doTask();
                });
            });
            break;
        case 'commentsSweep': {
            const users = Object.keys(this.watch.comments);
            this.getCommentUpdates(users, this.currCommentsSweepPage,
                (numSaves, commentUpdates) => {

                this.currCommentsSweepPage++;
                if (this.currCommentsSweepPage * 16 > numSaves) {
                    this.currCommentsSweepPage = 0;
                }
                for (const updateData of commentUpdates) {
                    this.taskList.push({
                        type: 'comments',
                        save: updateData.save,
                        newComments: updateData.newComments
                    });
                }
                setImmediate(() => {
                    this.doTask();
                });
            });
            break;
        }
        case 'comments':
            this.getComments(currTask.save, currTask.newComments,
                (commentUpdates) => {

                    const watchers = Object.keys(
                        this.watch.comments[currTask.save.Username]);
                    for(const watcher of watchers) {
                        this.env.sendMessage(watcher,
                            `New comments for '${currTask.save.Name}' (http://tpt.io/~${currTask.save.ID}):`);
                        for(const comment of commentUpdates) {
                            this.env.sendMessage(watcher,
                                `<${comment.Username}> ${comment.Text}`);
                        }
                    }
                    setImmediate(() => {
                        this.doTask();
                    });
                });
            break;
        default:
            throw 'Task type not recognized: ' + currTask.type.toString();
            break;
        }
    }
    refreshTaskList(){
        this.taskList = [];
        this.taskList.push({
            type: 'user'
        });
        this.taskList.push({
            type: 'subframe'
        });
        this.taskList.push({
            type: 'fp'
        });
        this.taskList.push({
            type: 'commentsSweep'
        });
    }
    sendSave(returnChannel, save){
        if ('PublishedTime' in save) {
            const updatedType = (save.PublishedTime == save.Updated) ?
                'New' : 'Updated';
            this.env.sendMessage(returnChannel,
                `[${updatedType}: '${save.Name}' by ${save.Username}; http://tpt.io/~${save.ID}]`);
        }
        else{
            this.env.sendMessage(returnChannel,
                `['${save.Name}' by ${save.Username}; http://tpt.io/~${save.ID}]`);
        }
    }
    getUserUpdates(users, handleUpdates, maxUpdates=100){
        if (users.length == 0) {
            handleUpdates([]);
            return;
        }
        const usersConcat = users.join(',');
        const searchReq =
            `http://powdertoythings.co.uk/Powder/Saves/Search.json?Search_Query=user%3A${usersConcat}`;
        request(searchReq, {
            json: true
        }, (err, resp, body) => {
            if (err) {
                console.log(err);
                handleUpdates([]);
                return false;
            }
            const res = [];
            for (const user of users) {
                if (!(user in this.cache.users)) {
                    this.cache.users[user] = 0;
                }
            }
            for (let i = Math.min(body.Saves.length, maxUpdates) - 1;
                i >= 0; i--) {
                const user = body.Saves[i].Username;
                const updatedTime = body.Saves[i].Updated;
                if (updatedTime > this.cache.users[user]) {
                    res.push(body.Saves[i]);
                    this.cache.users[user] = updatedTime;
                }
            }
            this.saveCache();
            handleUpdates(res);
        });
    }
    getSubframeUpdates(onComplete){
        const searchReq =
            `http://powdertoy.co.uk/Browse.json?Search_Query=subframe+sort%3Adate`;
        request(searchReq, {
            json: true
        }, (err, resp, body) => {
            if (err) {
                console.log(err);
                onComplete();
                return false;
            }
            for (let i = 0; i < body.Saves.length; i++) {
                const saveId = body.Saves[i].ID;
                if (!(saveId in this.cache.subframe)) {
                    this.cache.subframe[saveId] = {
                        state: 0,
                        updated: body.Saves[i].Updated
                    };
                }
            }
            this.saveCache();
            onComplete();
        });
    }
    getFpUpdates(handleUpdates){
        const searchReq = `http://powdertoy.co.uk/Browse.json`;
        request(searchReq, {
            json: true
        }, (err, resp, body) => {
            if (err) {
                console.log(err);
                handleUpdates([]);
                return false;
            }
            const res = [];
            for (let i = 0; i < body.Saves.length; i++) {
                const saveId = body.Saves[i].ID;
                if ((saveId in this.cache.subframe) &&
                    this.cache.subframe[saveId].state == 0) {
                    res.push(body.Saves[i]);
                    this.cache.subframe[saveId].state = 1;
                }
            }
            const currTime = new Date().getTime();
            for (const saveId in this.cache.subframe) {
                const updatedTime = this.cache.subframe[saveId].updated;
                if (currTime / 1000 - updatedTime >
                    10 * 24 * 60 * 60) {

                    delete this.cache.subframe[saveId];
                }
            }
            this.saveCache();
            handleUpdates(res);
        });
    }
    getCommentUpdates(users, pageNum, handleUpdates){
        if (users.length == 0) {
            handleUpdates(0, []);
            return;
        }
        const usersConcat = users.join(',');
        const searchReq =
            `http://powdertoy.co.uk/Browse.json?Search_Query=user%3A${usersConcat}+sort%3Adate&PageNum=${pageNum}`;
        request(searchReq, {
            json: true
        }, (err, resp, body) => {
            if (err) {
                console.log(err);
                handleUpdates(0, []);
                return false;
            }
            const res = [];
            for (let i = 0; i < body.Saves.length; i++) {
                const saveId = body.Saves[i].ID;
                if (saveId in this.cache.comments &&
                    body.Saves[i].Comments > this.cache.comments[saveId]) {

                    res.push({
                        save: body.Saves[i],
                        newComments: body.Saves[i].Comments -
                            this.cache.comments[saveId]
                    });
                }
                this.cache.comments[saveId] = body.Saves[i].Comments;
            }
            this.saveCache();
            handleUpdates(body.Count, res);
        });
    }
    getComments(save, numComments, handleUpdates){
        const searchReq =
            `http://powdertoy.co.uk/Browse/Comments.json?ID=${save.ID}&Start=0&Count=${numComments}`;
        request(searchReq, {
            json: true
        }, (err, resp, body) => {
            if (err) {
                console.log(err);
                handleUpdates([]);
                return false;
            }
            handleUpdates(body);
        });
    }
    saveCache(){
        fs.writeFileSync(CACHE_FILENAME, JSON.stringify(this.cache));
    }
    saveWatch(){
        fs.writeFileSync(WATCH_FILENAME, JSON.stringify(this.watch));
    }
    isValidUsername(user){
        return /^[a-zA-Z0-9-_]+$/i.test(user);
    }
    handleCommand(cmd, argstring, returnChannel, msgInfo){
        if(cmd in this.cmds){
            this.cmds[cmd](returnChannel, argstring, msgInfo);
        }
    }
};

module.exports = PowderPlugin;
