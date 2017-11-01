const fs = require('fs');

const config = require('../../config.js').PLUGINS_CONFIG.HANGMAN;

const WORDLIST_FILENAME = config.WORDLIST_FILENAME;
const WORDLIST = fs.readFileSync(WORDLIST_FILENAME).toString().split('\n').filter((word) => word.length > 0);

class HangmanPlugin{
    constructor(env){
        this.env = env;
        this.client = this.env.client;
        this.ongoingGames = {};
        this.cmds = {
            'hmstart': (returnChannel, argstring, msgInfo) => {
                let targetChannel = returnChannel;
                let solution;
                const splitMsg = argstring.split(' ');
                if(msgInfo.inQuery){
                    if(splitMsg.length != 2){
                        this.env.printHelp(
                            returnChannel, 'hmstart', msgInfo);
                        return;
                    }
                    targetChannel = splitMsg[0];
                    solution = splitMsg[1];
                    if(!(targetChannel in this.client.chans)){
                        this.env.sendMessage(
                            returnChannel,
                            'I\'m not in that channel.');
                        return;
                    }
                    if(!(msgInfo.sender.nick in
                        this.client.chans[targetChannel].users)){
                        this.env.sendMessage(
                            returnChannel,
                            'You\'re not in that channel.');
                        return;
                    }
                }
                else{
                    targetChannel = returnChannel;
                    solution = WORDLIST[parseInt(
                        Math.floor(Math.random() * WORDLIST.length))];
                }
                if(targetChannel in this.ongoingGames){
                    this.env.sendHighlight(returnChannel, msgInfo.sender,
                        'Game already in progress in this channel.');
                    return;
                }
                solution = solution.toLowerCase();
                const currGame = {
                    solution: solution,
                    host: msgInfo.sender,
                    guesses: new Set(),
                    lives: 5
                };
                this.ongoingGames[targetChannel] = currGame;
                this.env.sendMessage(targetChannel,
                    currGame.host.nick + ' has started a hangman game!');
                this.showHints(targetChannel);
            },
            'hmstop': (returnChannel, argstring, msgInfo) => {
                if(msgInfo.inQuery){
                    this.env.sendMessage(returnChannel,
                        'Please do that in channel.');
                    return;
                }
                if(!(returnChannel in this.ongoingGames)){
                    this.env.sendHighlight(returnChannel, msgInfo.sender,
                        'No game in progress right now!');
                    return;
                }
                delete this.ongoingGames[returnChannel];
                this.env.sendHighlight(returnChannel, msgInfo.sender,
                    'Game stopped!');
            },
            'hmshow': (returnChannel, argstring, msgInfo) => {
                if(msgInfo.inQuery){
                    this.env.sendMessage(returnChannel,
                        'Please do that in channel.');
                    return;
                }
                if(!(returnChannel in this.ongoingGames)){
                    this.env.sendHighlight(returnChannel, msgInfo.sender,
                        'No game in progress right now!');
                    return;
                }
                this.showHints(returnChannel);
            },
            'hmguess': (returnChannel, argstring, msgInfo) => {
                if(msgInfo.inQuery){
                    this.env.sendMessage(returnChannel,
                        'Please do that in channel.');
                    return;
                }
                if(!(returnChannel in this.ongoingGames)){
                    this.env.sendHighlight(returnChannel, msgInfo.sender,
                        'No game in progress right now!');
                    return;
                }
                if(argstring.length == 0){
                    this.env.printHelp(
                        returnChannel, 'hmguess', msgInfo);
                    return;
                }
                if(argstring.length != 1){
                    this.env.sendHighlight(returnChannel, msgInfo.sender,
                        'Please guess a single character >:|');
                    return;
                }
                const guess = argstring.toLowerCase();
                const currGame = this.ongoingGames[returnChannel];
                if(currGame.guesses.has(guess)){
                    this.env.sendHighlight(returnChannel, msgInfo.sender,
                        'You already guessed that before!');
                    return;
                }
                if(currGame.solution.indexOf(guess) == -1){
                    currGame.lives--;
                    this.env.sendMessage(returnChannel,
                        'The solution does not contain \'' + guess + '\'.');
                    if(currGame.lives == 0){
                        this.env.sendMessage(returnChannel,
                            'You lose! The solution was \'' +
                            currGame.solution + '\'.');
                        delete this.ongoingGames[returnChannel];
                        return;
                    }
                }
                currGame.guesses.add(guess);
                this.showHints(returnChannel);
                let isGameFinished = true;
                for(let i = 0; i < currGame.solution.length; i++){
                    if(!currGame.guesses.has(currGame.solution[i])){
                        isGameFinished = false;
                        break;
                    }
                }
                if(isGameFinished){
                    this.env.sendMessage(returnChannel, 'You won!');
                    delete this.ongoingGames[returnChannel];
                    return;
                }
            }
        };
    }
    handleCommand(cmd, argstring, returnChannel, msgInfo){
        if(cmd in this.cmds){
            this.cmds[cmd](returnChannel, argstring, msgInfo);
        }
    }
    showHints(targetChannel){
        const currGame = this.ongoingGames[targetChannel];
        const solution = currGame.solution;
        let hintString = new Array(solution.length).fill('_');
        for(let i = 0; i < solution.length; i++){
            if(currGame.guesses.has(solution[i])){
                hintString[i] = solution[i];
            }
        }
        this.env.sendMessage(targetChannel,
            'Hint: ' + hintString.join(' '));
        this.env.sendMessage(targetChannel,
            'Lives: ' + currGame.lives.toString() +
            '   Guesses: ' +
            Array.from(currGame.guesses).sort().join(', '));
    }
};

module.exports = HangmanPlugin;
