const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const User = require('../User.js');
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
	'On a scale from 1 to 5, how was your day?',
];

class EatPlugin{
	constructor(env){
		this.env = env;
		this.ircCli = this.env.ircCli;
		this.discordCli = this.env.discordCli;
		this.qgen = new QuestionGenerator();
		this.prevTime = new Date();
		this.pending = false;

		this.db = new sqlite3.Database(config.DB_PATH, (err) => {
			if (err)
				throw err;
		});
		this.createTables();

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
			'teaspin': (returnChannel, argstring, sender) => {
				this.dailyReminder(
					returnChannel, [], () => {}, () => {}, true
				);
			},
			'tease': (returnChannel, argstring, sender) => {
				const q = argstring.trim();
				this.setTeaserQ(returnChannel, sender, q);
			},
			'rotateteaser': (returnChannel, argstring, sender) => {
				let targetChan = returnChannel;
				if (returnChannel.isQuery && argstring != '') {
					targetChan = this.env.parseChanFromUser(
						returnChannel.type,
						argstring,
						returnChannel,
						sender
					);
				}
				this.rotateTeaser(targetChan, false);
				this.env.sendHighlight(returnChannel, sender,
					`Teasers rotated!`);
			},
		};
		this.updateInterval = setInterval(this.update.bind(this), 1000 * 30);
	}
	createTables() {
		this.db.run(`
			CREATE TABLE IF NOT EXISTS periodicQs_log (
				question TEXT NOT NULL,
				time_asked INTEGER NOT NULL
			)
		`);
		this.db.run(`
			CREATE TABLE IF NOT EXISTS teasers_log (
				username TEXT NOT NULL,
				question TEXT NOT NULL,
				time_pinged INTEGER NOT NULL
			)
		`);
	}
	setTeaserQ(returnChannel, sender, q) {
		this.db.all(`
			SELECT username FROM teasers_log
			WHERE time_pinged = (
				SELECT MAX(time_pinged) FROM teasers_log
			)
		`, [], (err, rows) => {
			if (err) {
				console.error(`error while fetching current teaser: ${err}`);
				return;
			}
			if (rows.length == 0 || rows[0]['username'] != sender.id) {
				this.env.sendHighlight(
					returnChannel, sender,
					`Oops, you aren't the current teaser. Don't worry, it'd be your turn soon!`
				);
				return;
			}
			this.db.run(`
				UPDATE teasers_log
				SET question = ?
				WHERE time_pinged = (
					SELECT MAX(time_pinged) FROM teasers_log
				)
			`, [q], (err) => {
				if (err) {
					console.error(`error while setting teaser question: ${err}`);
					return;
				}
				if (q == '') {
					this.env.sendHighlight(
						returnChannel, sender,
						`Question deleted.`
					);
					return;
				}
				this.env.sendHighlight(
					returnChannel, sender,
					`Question registered!`
				);
			});
		});
	}
	getChannelsByName(chans) {
		return chans.map(
			echoChanStr => Channel.fromString(
				echoChanStr, this.ircCli, this.discordCli
			)
		);
	}
	rotateTeaser(chan, testing = false) {
		const doRotateTeasers = (usedTeasers, teasers) => {
			const newTeasers = teasers.filter(
				(teaser) => {
					const teaserUser = new User(
						User.TYPE_DISCORD,
						teaser.user
					);
					return !usedTeasers.includes(teaserUser.id);
				}
			);
			const teasersPool =
				(newTeasers.length == 0) ?
				teasers : newTeasers;
			const teaser = teasersPool[
				Math.floor(Math.random() * teasersPool.length)
			].user;
			if (!testing) {
				teaser.createDM().then((dmChannel) => {
					const teaserDm = new Channel(
						Channel.TYPE_DISCORD,
						teaser.dmChannel
					);

					this.env.sendMessage(teaserDm, `Write a question for tomorrow's teaspin! Reply with the following command:`);
					this.env.sendMessage(teaserDm, `\`tease <question>\``);
					this.env.sendMessage(teaserDm, `For example:`);
					this.env.sendMessage(teaserDm, `\`tease What is your favorite color?\``);
					this.env.sendMessage(teaserDm, `Don't fret over it! If you change your mind later, you can delete your question by typing \`tease\` on its own.`);
				}).catch(console.error);

				const teaserUser = new User(
					User.TYPE_DISCORD,
					teaser
				);
				this.db.run(`
					INSERT INTO teasers_log
					(username, question, time_pinged)
					VALUES (?, "", ?)
				`, [teaserUser.id, new Date().getTime()]);
				this.db.run(`
					DELETE FROM teasers_log
					WHERE rowid IN
					(
						SELECT rowid FROM teasers_log
						ORDER BY time_pinged DESC
						LIMIT 100
						OFFSET ${config.TEASER_MIN_INTERVAL}
					)
				`);
			}
		};
		this.db.all(
			`SELECT username FROM teasers_log`,
			[],
			(err, rows) => {
				if (err) {
					console.error(`error while fetching previous teasers: ${err}`);
					return;
				}
				const usedTeasers = rows.map(
					(row) => row['username']
				);
				chan.getRoleMembers(config.TEASER_ROLE).then(teasers => {
					doRotateTeasers(usedTeasers, teasers);
				}).catch(console.error);
			}
		);
	}
	dailyReminder(chan, echoChans, callback, errCallback, testing = false) {
		const sendReminder = (periodicQ, oneOffSource, oneOffQ) => {
			chan.encodeRoleMention(config.HIGHLIGHT_ROLE).then(mention => {
				this.env.sendMessage(chan, `${mention} Question time!${testing ? ' [TESTING]' : ''}`);
				const periodicMsg = `Random periodic: ${periodicQ}`;
				const oneOffMsg = `Random(?) one-off (s${oneOffSource}): ${oneOffQ}`;
				this.env.sendMessage(chan, periodicMsg);
				this.env.sendMessage(chan, oneOffMsg);
				for (const echoChan of echoChans) {
					this.env.sendMessage(echoChan, periodicMsg);
					this.env.sendMessage(echoChan, oneOffMsg);
				}

				if (!testing) {
					this.rotateTeaser(chan);
				}
			}).catch(console.error);
		};

		const sendReminderWithTeaser = (
			periodicQ, oneOffSource, oneOffQ
		) => {
			this.db.all(`
				SELECT question FROM teasers_log
				WHERE time_pinged = (
					SELECT MAX(time_pinged) FROM teasers_log
				)
			`, [], (err, rows) => {
				if (err) {
					console.error(`error while fetching latest teaser question: ${err}`);
					return;
				}
				const newOneOffQ =
					(rows.length == 0 || rows[0]['question'] == '') ?
					oneOffQ : rows[0]['question'];
				sendReminder(periodicQ, oneOffSource, newOneOffQ);
			});
		};

		const oneOffSource = this.qgen.genRandSource();
		this.qgen.generate(oneOffSource, (oneOffQ) => {
			chan.val.guild.roles.fetch().then((roles) => {
				this.db.all(`
					SELECT question FROM periodicQs_log
				`, [], (err, rows) => {
					if (err) {
						console.error(`error while fetching previous questions: ${err}`);
						return;
					}
					const usedQuestions = rows.map(
						(row) => row['question']
					);
					const newQs = periodicQs.filter((q) => {
						return !usedQuestions.includes(q);
					});
					const periodicQ = newQs[
						Math.floor(Math.random() * newQs.length)
					];
					sendReminderWithTeaser(
						periodicQ, oneOffSource, oneOffQ
					);
					if (!testing) {
						this.db.run(`
							INSERT INTO periodicQs_log
							(question, time_asked)
							VALUES (?, ?)
						`, [periodicQ, new Date().getTime()]);
						this.db.run(`
							DELETE FROM periodicQs_log
							WHERE rowid IN
							(
								SELECT rowid FROM periodicQs_log
								ORDER BY time_asked DESC
								LIMIT 100
								OFFSET ${config.PERIODIC_MIN_INTERVAL}
							)
						`);
					}
				});
			});
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
		const echoChans = this.getChannelsByName(config.ECHO_CHANNELS);
		this.dailyReminder(
			chan,
			echoChans,
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
