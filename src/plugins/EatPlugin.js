const fs = require('fs');

const Channel = require('../Channel.js');
const config = require('../../config.js').PLUGINS.EAT;

const qgenFile = config.QGEN_FILENAME;
const QuestionGenerator = require(qgenFile);

const periodicQs = [
	'Did you do anything interesting today?',
	'Did you learn anything interesting today?',
	'How are you feeling right now?',
	'What are you working on right now?',
	'What is the last productive thing you did?',
	'What is the last fun thing you did?',
	'Are you looking forward to anything in the next few days?',
	'On a scale from 1 to 5, how was your day?'
];

class EatPlugin{
	constructor(env){
		this.env = env;
		this.ircCli = this.env.ircCli;
		this.discordCli = this.env.discordCli;
		this.qgen = new QuestionGenerator();
		this.prevTime = new Date();
		this.pending = false;
		this.cmds = {
			'genq': (returnChannel, argstring, sender) => {
				let source = this.qgen.genRandSource();
				if (argstring != '') {
					source = parseInt(argstring);
					if (!Number.isInteger(source) || !this.qgen.isValidSource(source)) {
						this.env.sendHighlight(returnChannel, sender,
							'Not a valid source ID!');
						return;
					}
				}
				this.qgen.generate(source, (question) => {
					this.env.sendHighlight(returnChannel, sender,
						`Random question (s${source}): ${question}`);
				}, () => {});
			},
			'pleaseeat': (returnChannel, argstring, sender) => {
				this.dailyReminder(returnChannel, () => {}, () => {}, true);
			}
		};
		this.updateInterval = setInterval(this.update.bind(this), 1000 * 30);
	}
	dailyReminder(chan, callback, errCallback, testing = false) {
		const source = this.qgen.genRandSource();
		this.qgen.generate(source, (question) => {
			this.env.sendMessage(chan, `${chan.encodeMention(config.HIGHLIGHT_USER)} Don't forget to eat!!!${testing ? ' [TESTING]' : ''}`);
			this.env.sendMessage(chan, `Random periodic: ${periodicQs[Math.floor(Math.random() * periodicQs.length)]}`);
			this.env.sendMessage(chan, `Random one-off (s${source}): ${question}`);
			callback();
		}, errCallback);
	}
	update() {
		const currTime = new Date();
		// sanity check for weird time stuff
		if (this.prevTime.getTime() >= currTime.getTime()) {
			return;
		}

		if (this.pending) {
			return;
		}
		this.pending = true;
		const end = () => {
			this.pending = false;
			this.prevTime = currTime;
		};
		const endErr = () => {
			this.pending = false;
		};

		// only activate when 7pm changes to 8pm
		const TESTING_MINUTES = false;
		let activate = false;
		const prevHours = this.prevTime.getHours();
		const currHours = currTime.getHours();
		for (let h = prevHours; h != currHours; h = (h + 1) % 24) {
			if (h == 19) {
				activate = true;
				break;
			}
		}
		if (TESTING_MINUTES) {
			const prevMinutes = this.prevTime.getMinutes();
			const currMinutes = currTime.getMinutes();
			for (let h = prevMinutes; h != currMinutes; h = (h + 1) % 60) {
				if (h == 12) {
					activate = true;
					break;
				}
			}
		}
		if (!activate) {
			end();
			return;
		}

		const chan = Channel.fromString(
			config.CHANNEL, this.ircCli, this.discordCli
		);
		this.dailyReminder(
			chan,
			() => {
				end();
			},
			() => {
				endErr();
			},
			false
		);
	}
	dispose(){
		clearInterval(this.updateInterval);
		this.qgen.dispose();
		delete require.cache[require.resolve(qgenFile)]
	}
	handleCommand(cmd, argstring, returnChannel, sender){
		if(cmd in this.cmds){
			this.cmds[cmd](returnChannel, argstring, sender);
		}
	}
};

module.exports = EatPlugin;
