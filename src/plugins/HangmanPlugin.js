const fs = require('fs');

const config = require('../../config.js').PLUGINS_CONFIG.HANGMAN;

const WORDLIST_FILENAME = config.WORDLIST_FILENAME;
const WORDLIST = fs.readFileSync(WORDLIST_FILENAME).toString().split('\n').filter((word) => word.length > 0);

class HangmanPlugin{
    constructor(env){
        this.env = env;
        this.ircCli = this.env.ircCli;
        this.ongoingGames = {};
        this.cmds = {
            'hmstart': (returnChannel, argstring, sender) => {
                let targetChannel = returnChannel;
                let solution;
                const splitMsg = argstring.split(' ');
                if (returnChannel.isQuery) {
                    if (returnChannel.type != Channel.TYPE_IRC) {
                        this.env.sendHighlight(
                            returnChannel,
                            sender,
                            `Starting a game from query is only enabled on IRC.`
                        );
                        return;
                    }
                    if (splitMsg.length != 2) {
                        this.env.printHelp(
                            returnChannel, 'hmstart', sender
                        );
                        return;
                    }
                    targetChannel = new Channel(
                        Channel.TYPE_IRC, this.ircCli, splitMsg[0]
                    );
                    solution = splitMsg[1];
                    if (!(targetChannel.val in this.ircCli.chans)) {
                        this.env.sendMessage(
                            returnChannel,
                            'I\'m not in that channel.'
                        );
                        return;
                    }
                    if (!(sender.nick in
                            this.ircCli.chans[targetChannel.val].users)) {
                        this.env.sendMessage(
                            returnChannel,
                            'You\'re not in that channel.'
                        );
                        return;
                    }
                }
                else {
                    targetChannel = returnChannel;
                    solution = WORDLIST[parseInt(
                        Math.floor(Math.random() * WORDLIST.length))];
                }
                if (targetChannel.id in this.ongoingGames) {
                    this.env.sendHighlight(returnChannel, sender,
                        'Game already in progress in this channel.');
                    return;
                }
                solution = solution.toLowerCase();
                const game = {
                    solution: solution,
                    host: sender.id,
                    guesses: new Set(),
                    lives: 5
                };
                this.ongoingGames[targetChannel.id] = game;
                this.env.sendMessage(targetChannel,
                    game.host.nick + ' has started a hangman game!');
                this.showHints(targetChannel);
            },
            'hmstop': (returnChannel, argstring, sender) => {
                const game = this.requestGame(returnChannel, sender);
                if (game == null)
                    return;
                delete this.ongoingGames[returnChannel.id];
                this.env.sendHighlight(returnChannel, sender,
                    'Game stopped!');
            },
            'hmshow': (returnChannel, argstring, sender) => {
                const game = this.requestGame(returnChannel, sender);
                if (game == null)
                    return;
                this.showHints(returnChannel);
            },
            'hmguess': (returnChannel, argstring, msgInfo) => {
                const game = this.requestGame(returnChannel, sender);
                if (game == null)
                    return;
                if (argstring.length == 0) {
                    this.env.printHelp(
                        returnChannel, 'hmguess', sender
                    );
                    return;
                }
                if (/^[a-zA-Z]$/.test(argstring)) {
                    this.env.sendHighlight(returnChannel, sender,
                        'Please guess a single character >:|');
                    return;
                }
                const guess = argstring.toLowerCase();
                if (game.guesses.has(guess)) {
                    this.env.sendHighlight(returnChannel, sender,
                        'You already guessed that before!');
                    return;
                }
                if (game.solution.indexOf(guess) == -1) {
                    game.lives--;
                    this.env.sendMessage(returnChannel,
                        'The solution does not contain \'' + guess + '\'.');
                    if(game.lives == 0){
                        this.env.sendMessage(returnChannel,
                            'You lose! The solution was \'' +
                            game.solution + '\'.');
                        delete this.ongoingGames[returnChannel.id];
                        return;
                    }
                }
                game.guesses.add(guess);
                this.showHints(returnChannel);
                let isGameFinished = true;
                for (let i = 0; i < game.solution.length; i++) {
                    if (!game.guesses.has(game.solution[i])) {
                        isGameFinished = false;
                        break;
                    }
                }
                if (isGameFinished) {
                    this.env.sendMessage(returnChannel, 'You won!');
                    delete this.ongoingGames[returnChannel.id];
                    return;
                }
            }
        };
    }
    requestGame(chan, sender) {
        if (chan.isQuery) {
            this.env.sendMessage(chan,
                'Please do that in channel.');
            return null;
        }
        if (!(chan.id in this.ongoingGames)) {
            this.env.sendHighlight(chan, sender,
                'No game in progress right now!');
            return null;
        }
        return this.ongoingGames[chan.id];
    }
    handleCommand(cmd, argstring, returnChannel, sender){
        if(cmd in this.cmds){
            this.cmds[cmd](returnChannel, argstring, sender);
        }
    }
    showHints(targetChannel){
        const game = this.ongoingGames[targetChannel];
        const solution = game.solution;
        let hintString = new Array(solution.length).fill('_');
        for(let i = 0; i < solution.length; i++){
            if(game.guesses.has(solution[i])){
                hintString[i] = solution[i];
            }
        }
        this.env.sendMessage(targetChannel,
            'Hint: ' + hintString.join(' '));
        this.env.sendMessage(targetChannel,
            'Lives: ' + game.lives.toString() +
            '   Guesses: ' +
            Array.from(game.guesses).sort().join(', '));
    }
};

module.exports = HangmanPlugin;
