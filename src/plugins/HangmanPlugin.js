const fs = require('fs');

const Channel = require('../Channel.js');
const config = require('../../config.js').PLUGINS.HANGMAN;

const WORDLIST_FILENAME = config.WORDLIST_FILENAME;
const WORDLIST = fs.readFileSync(WORDLIST_FILENAME).toString().split('\n').filter((word) => word.length > 0);

class HangmanPlugin{
	constructor(env){
		this.env = env;
		this.ircCli = this.env.ircCli;
		this.discordCli = this.env.discordCli;
		this.ongoingGames = {};
		this.cmds = {
			'hmstart': (returnChannel, argstring, sender) => {
				let targetChannel = returnChannel;
				let solution;
				const splitMsg = argstring.split(' ');
				if (returnChannel.isQuery) {
					if (splitMsg.length != 2) {
						this.env.printHelp(
							returnChannel, 'hmstart', sender
						);
						return;
					}
					targetChannel = this.env.parseChanFromUser(
						returnChannel.type,
						splitMsg[0],
						returnChannel,
						sender
					);
					if (targetChannel == null)
						return;
					if (!targetChannel.hasUser(sender)) {
						this.env.sendMessage(
							returnChannel,
							'You\'re not in that channel.'
						);
						return;
					}
					solution = splitMsg[1];
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
					host: sender.getNick(targetChannel),
					guesses: new Set(),
					lives: 5
				};
				this.ongoingGames[targetChannel.id] = game;
				this.env.sendMessage(targetChannel,
					game.host + ' has started a hangman game!');
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
			'hmguess': (returnChannel, argstring, sender) => {
				const game = this.requestGame(returnChannel, sender);
				if (game == null)
					return;
				if (argstring.length == 0) {
					this.env.printHelp(
						returnChannel, 'hmguess', sender
					);
					return;
				}
				const guess = argstring.trim().toLowerCase();
				if (!/^[a-z]$/.test(guess)) {
					this.env.sendHighlight(returnChannel, sender,
						'Please guess a single character >:|');
					return;
				}
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
		const game = this.ongoingGames[targetChannel.id];
		const solution = game.solution;
		let hintArr = new Array(solution.length).fill('_');
		for(let i = 0; i < solution.length; i++){
			if(game.guesses.has(solution[i])){
				hintArr[i] = solution[i];
			}
		}
		const hintStr = targetChannel.escapeIrcStr(hintArr.join(' '));
		this.env.sendMessage(targetChannel,
			`Hint: ${hintStr}`);
		this.env.sendMessage(targetChannel,
			`Lives: ${game.lives.toString()}   Guesses: ${Array.from(game.guesses).sort().join(', ')}`);
	}
};

module.exports = HangmanPlugin;
