const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const request = require('request');

const sqlite3 = require('sqlite3').verbose();

const config = require('../../config.js').PLUGINS.POWDER;

const Channel = require('../Channel.js');

const UPDATE_MIN_INTERVAL = config.UPDATE_MIN_INTERVAL;
const FP_EXPIRE_TIME_SECONDS = 10 * 24 * 60 * 60; // 10 days

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

const LEGACY = false;

class PowderPlugin {
	constructor(env){
		this.env = env;

		this.db = new sqlite3.Database(config.DB_PATH, (err) => {
			if (err)
				throw err;
		});

		this.cache = CACHE;
		this.watch = WATCH;

		this.cmds = {
			'puser': (returnChannel, argstring, sender) => {
				// Testing command, don't use
				const user = argstring;
				if (user == '') {
					this.env.sendHighlight(returnChannel, sender,
						'Please provide a username.');
					return;
				}
				if (!this.isValidUsername(user)) {
					this.env.sendHighlight(returnChannel, sender,
						'Invalid username!');
					return;
				}
				this.getUserUpdates([user], (userUpdates) => {
					for (let i = 0; i < userUpdates.length; i++) {
						this.sendSave(returnChannel, userUpdates[i]);
					}
				}, 4);
			},
			'pwatchadd': (returnChannel, argstring, sender) => {
				if (argstring == '') {
					this.env.printHelp(returnChannel, 'pwatchadd', sender);
					return;
				}

				const watchlist = this.parseWatchlist(
					argstring, returnChannel, sender
				);
				const watcherChan = Channel.getDmChan(
					this.env.ircCli,
					this.env.discordCli,
					sender
				).fullName;
				const usersPlaceholders = watchlist.users.map(
					watchee => '(?, ?)'
				).join(',');
				const usersValues = [].concat(...watchlist.users.map(
					watchee => [watcherChan, watchee]
				));
				const usersPlusPlaceholders = watchlist.usersPlus.map(
					watchee => '(?, ?)'
				).join(',');
				const usersPlusValues = [].concat(
					...watchlist.usersPlus.map(
						watchee => [watcherChan, watchee]
					)
				);
				const savesPlaceholders = watchlist.saves.map(
					watchee => '(?, ?)'
				).join(',');
				const savesValues = [].concat(...watchlist.saves.map(
					watchee => [watcherChan, watchee]
				));

				let numQueriesNeeded = 0;
				let numQueriesCompleted = 0;
				if (watchlist.users.length != 0)
					numQueriesNeeded++;
				if (watchlist.usersPlus.length != 0)
					numQueriesNeeded++;
				if (watchlist.saves.length != 0)
					numQueriesNeeded++;
				const onInsert = (err) => {
					if (err) {
						console.error(err);
						return;
					}
					numQueriesCompleted++;
					if (numQueriesCompleted != numQueriesNeeded)
						return;
					this.env.sendHighlight(
						returnChannel,
						sender,
						`Watches added!`
					);
					this.sendWatchlist(sender);
				};

				if (watchlist.users.length != 0)
					this.db.run(
						`INSERT OR IGNORE INTO user_watches(watcher, watchee) VALUES ${usersPlaceholders}`,
						usersValues,
						onInsert
					);
				if (watchlist.usersPlus.length != 0)
					this.db.run(
						`INSERT OR IGNORE INTO user_comment_watches(watcher, watchee) VALUES ${usersPlusPlaceholders}`,
						usersPlusValues,
						onInsert
					);
				if (watchlist.saves.length != 0)
					this.db.run(
						`INSERT OR IGNORE INTO comment_watches(watcher, watchee) VALUES ${savesPlaceholders}`,
						savesValues,
						onInsert
					);
			},
			'pwatchrem': (returnChannel, argstring, sender) => {
				if (argstring == '') {
					this.env.printHelp(returnChannel, 'pwatchrem', sender);
					return;
				}

				const watchlist = this.parseWatchlist(
					argstring, returnChannel, sender
				);
				const watcherChan = Channel.getDmChan(
					this.env.ircCli,
					this.env.discordCli,
					sender
				).fullName;
				const usersPlaceholders = watchlist.users.map(
					watchee => '(watcher = ? AND watchee = ?)'
				).join(' OR ');
				const usersValues = [].concat(...watchlist.users.map(
					watchee => [watcherChan, watchee]
				));
				const usersPlusPlaceholders = watchlist.usersPlus.map(
					watchee => '(watcher = ? AND watchee = ?)'
				).join(' OR ');
				const usersPlusValues = [].concat(
					...watchlist.usersPlus.map(
						watchee => [watcherChan, watchee]
					)
				);
				const savesPlaceholders = watchlist.saves.map(
					watchee => '(watcher = ? AND watchee = ?)'
				).join(' OR ');
				const savesValues = [].concat(...watchlist.saves.map(
					watchee => [watcherChan, watchee]
				));

				let numQueriesNeeded = 0;
				let numQueriesCompleted = 0;
				if (watchlist.users.length != 0)
					numQueriesNeeded++;
				if (watchlist.usersPlus.length != 0)
					numQueriesNeeded++;
				if (watchlist.saves.length != 0)
					numQueriesNeeded++;
				let totChanges = 0;
				const onDelete = (numChanges) => {
					totChanges += numChanges;
					numQueriesCompleted++;
					if (numQueriesCompleted != numQueriesNeeded)
						return;
					this.env.sendHighlight(
						returnChannel,
						sender,
						`${totChanges} ${(totChanges == 1) ? 'watch' : 'watches'} removed!`
					);
					this.sendWatchlist(sender);
				};
				const onDeleteOuter = function(err) {
					if (err) {
						console.error(err);
						return;
					}
					onDelete(this.changes);
				};

				if (watchlist.users.length != 0)
					this.db.run(
						`DELETE FROM user_watches WHERE ${usersPlaceholders}`,
						usersValues,
						onDeleteOuter
					);
				if (watchlist.usersPlus.length != 0)
					this.db.run(
						`DELETE FROM user_comment_watches WHERE ${usersPlusPlaceholders}`,
						usersPlusValues,
						onDeleteOuter
					);
				if (watchlist.saves.length != 0)
					this.db.run(
						`DELETE FROM comment_watches WHERE ${savesPlaceholders}`,
						savesValues,
						onDeleteOuter
					);
			},
			'pwatchlist': (returnChannel, argstring, sender) => {
				// const query = (argstring == '') ? sender.id : argstring;
				this.sendWatchlist(sender);
			},
			'pcacheclear': (returnChannel, argstring, sender) => {
				if (this.env.permissions.isAdmin(sender)){
					if (argstring == 'subframe') {
						this.cache.subframe = {};
						this.db.run(`DELETE FROM fp_cache`);
					}
					else {
						this.cache = INIT_CACHE_SKELETON;
						this.db.run(`DELETE FROM fp_cache`);
						this.db.run(`DELETE FROM user_cache`);
						this.db.run(`DELETE FROM save_cache`);
					}
					this.saveCache();
					this.env.sendHighlight(returnChannel, sender,
						'Cache cleared!');
				}
			},
			// 'pwatchclear': (returnChannel, argstring, sender) => {
			// 	// if (argstring == 'all') {
			// 	// 	if(this.env.permissions.isAdmin(sender)){
			// 	// 		this.watch = INIT_WATCH_SKELETON;
			// 	// 		this.saveWatch();
			// 	// 		this.env.sendHighlight(
			// 	// 			returnChannel, sender,
			// 	// 			'All watchlists cleared!');
			// 	// 	}
			// 	// 	return;
			// 	// }
			// 	const senderId = sender.id;
			// 	for (const user in this.watch.users) {
			// 		if (senderId in this.watch.users[user]) {
			// 			delete this.watch.users[user][senderId];
			// 		}
			// 	}
			// 	this.db.run(
			// 		`DELETE FROM user_watches WHERE watcher = ?`,
			// 		[senderId],
			// 		onDeleteOuter
			// 	);
			// 	this.db.run(
			// 		`DELETE FROM user_comment_watches WHERE watcher = ?`,
			// 		[senderId],
			// 		onDeleteOuter
			// 	);
			// 	this.db.run(
			// 		`DELETE FROM comment_watches WHERE watcher = ?`,
			// 		[senderId],
			// 		onDeleteOuter
			// 	);
			// 	this.env.sendHighlight(returnChannel, sender,
			// 		'Watchlist cleared!');
			// },
			// 'pcommentwatchlist': (returnChannel, argstring, sender) => {
			// 	const senderId = sender.id;
			// 	const query = (argstring == '') ? senderId : argstring;
			// 	const watchList = [];
			// 	for (const user in this.watch.comments) {
			// 		if (query in this.watch.comments[user]) {
			// 			watchList.push(user);
			// 		}
			// 	}
			// 	this.env.sendNotice(sender,
			// 		(watchList.length > 0) ?
			// 		watchList.join(', ') :
			// 		'Comment watchlist empty!');
			// },
			// 'pcommentwatchadd': (returnChannel, argstring, sender) => {
			// 	if (argstring == '') {
			// 		this.env.sendHighlight(returnChannel, sender,
			// 			'Please provide a username.');
			// 		return;
			// 	}
			// 	const users = argstring.split(' ');
			// 	const senderId = sender.id;
			// 	for (const user of users) {
			// 		if (!this.isValidUsername(user)) {
			// 			this.env.sendHighlight(
			// 				returnChannel, sender,
			// 				`Invalid username: ${user}`);
			// 			return;
			// 		}
			// 	}
			// 	for (const user of users) {
			// 		if (!(user in this.watch.comments)) {
			// 			this.watch.comments[user] = {};
			// 		}
			// 		this.watch.comments[user][senderId] = true;
			// 	}
			// 	this.saveWatch();
			// 	this.env.sendHighlight(returnChannel, sender,
			// 		'Comment watch added!');
			// },
			// 'pcommentwatchrem': (returnChannel, argstring, sender) => {
			// 	const users = argstring.split(' ');
			// 	const senderId = sender.id;
			// 	let numWatchesRemoved = 0;
			// 	for (const user of users) {
			// 		if ((user in this.watch.comments) &&
			// 			(senderId in this.watch.comments[user])) {
			// 			delete this.watch.comments[user][senderId];
			// 			numWatchesRemoved++;
			// 		}
			// 		else{
			// 			this.env.sendHighlight(
			// 				returnChannel, sender,
			// 				user +
			// 				' isn\'t not on your comment watchlist!');
			// 		}
			// 	}
			// 	this.saveWatch();
			// 	this.env.sendHighlight(returnChannel, sender,
			// 		numWatchesRemoved.toString() +
			// 		' comment watches removed!');
			// 	return;
			// },
			'pquery': (returnChannel, argstring, sender) => {
				const saveId = parseInt(argstring);
				if (saveId.toString() != argstring.trim()) {
					this.env.printHelp(returnChannel, 'pquery', sender);
					return;
				}
				this.querySave(saveId, returnChannel);
			},
		};
		this.busy = false;
		this.taskStack = [];
		this.highPriorityTaskStack = [];
		this.currCommentsSweepUserIndex = 0;
		this.currCommentsSweepPage = 0;
		this.updateTimeout = null;
		this.active = true;
		this.refreshTaskList();
		this.createTables();
		this.update();
	}
	dispose(){
		if (this.updateTimeout != null) {
			clearTimeout(this.updateTimeout);
		}
		this.active = false;
	}
	createTables() {
		//// WATCHES
		this.db.run(`
			CREATE TABLE IF NOT EXISTS user_watches (
				watcher TEXT NOT NULL,
				watchee TEXT NOT NULL,
				UNIQUE (watcher, watchee)
			)`
		);
		this.db.run(`
			CREATE TABLE IF NOT EXISTS comment_watches (
				watcher TEXT NOT NULL,
				watchee INTEGER NOT NULL,
				UNIQUE (watcher, watchee)
			)`
		);
		this.db.run(`
			CREATE TABLE IF NOT EXISTS user_comment_watches (
				watcher TEXT NOT NULL,
				watchee TEXT NOT NULL,
				UNIQUE (watcher, watchee)
			)`
		);

		//// CACHES
		// last_updated for fp_cache is just used to automatically clear
		// entries when they have been in for more than a week, so we don't
		// need to update it when the save gets updated.
		this.db.run(`
			CREATE TABLE IF NOT EXISTS fp_cache (
				save_id INTEGER NOT NULL PRIMARY KEY,
				last_updated INTEGER NOT NULL,
				reported INTEGER NOT NULL CHECK (reported IN (0, 1))
			)`
		);
		this.db.run(`
			CREATE TABLE IF NOT EXISTS user_cache (
				username TEXT NOT NULL PRIMARY KEY,
				last_updated INTEGER NOT NULL
			)`
		);
		this.db.run(`
			CREATE TABLE IF NOT EXISTS save_cache (
				save_id INTEGER NOT NULL PRIMARY KEY,
				num_comments_seen INTEGER NOT NULL
			)`
		);
	}
	parseWatchlist(str, returnChan, sender) {
		let watchlist = {
			users: [],
			usersPlus: [],
			saves: []
		};
		const queries = str.split(' ');
		for (const query of queries) {
			let match;
			match = PowderPlugin.REGEX_USERNAME.exec(query);
			if (match != null) {
				watchlist.users.push(query);
				continue;
			}
			match = PowderPlugin.REGEX_USERNAME_PLUS.exec(query);
			if (match != null) {
				if (match.length != 2)
					throw new Error('match should have length 2');
				watchlist.usersPlus.push(match[1]);
				continue;
			}
			match = PowderPlugin.REGEX_SAVE_ID.exec(query);
			if (match != null) {
				if (match.length != 2)
					throw new Error('match should have length 2');
				watchlist.saves.push(parseInt(match[1]));
				continue;
			}
			this.env.sendHighlight(
				returnChan,
				sender,
				`Not a username or save ID: ${query}`);
			return null;
		}
		return watchlist;
	}
	sendWatchlist(user, query = null) {
		if (query == null)
			query = Channel.getDmChan(
				this.env.ircCli,
				this.env.discordCli,
				user
			).fullName;
		this.db.all(
			`SELECT watchee FROM user_watches WHERE watcher = (?) UNION ALL SELECT (watchee || '+') AS watchee FROM user_comment_watches WHERE watcher = (?) UNION ALL SELECT ('~' || watchee) AS watchee FROM comment_watches WHERE watcher = (?)`,
			[query, query, query],
			(err, rows) => {
				if (err) {
					console.error(`error while getting watchlist: ${err}`);
					return;
				}
				let watchees = rows.map(row => row.watchee);
				watchees.sort();
				this.env.sendNotice(user,
					(watchees.length > 0) ?
					`Watchlist: ${watchees.join(' ')}` :
					'Watchlist empty!');
			}
		);
	}
	update(){
		if (this.busy)
			return;
		this.busy = true;
		this.prevUpdateStart = new Date().getTime();
		this.doTaskAsync();
	}
	doTaskAsync() {
		setImmediate(() => {
			this.doTask();
		});
	}
	doTask(){
		if (!this.active)
			return;

		let currTask;
		if (this.highPriorityTaskStack.length != 0)
			currTask = this.highPriorityTaskStack.pop();
		else if (this.taskStack.length != 0)
			currTask = this.taskStack.pop();
		else {
			this.refreshTaskList();
			const nextUpdateStart =
				this.prevUpdateStart + UPDATE_MIN_INTERVAL;
			let sleepInterval = nextUpdateStart - new Date().getTime();
			if (sleepInterval < 0) sleepInterval = 0;
			this.busy = false;
			this.updateTimeout = setTimeout(() => {
				this.update();
			}, sleepInterval);
			return;
		}

		switch(currTask.type) {
		case 'querySave': {
			this.getSave(currTask.saveId, (save) => {
				if (save == null)
					this.doTaskAsync();
				this.sendSave(
					currTask.returnChan,
					save
				);
				this.doTaskAsync();
			});
			break;
		}
		case 'user': {
			const processUpdates = (userUpdates) => {
				for (let i = 0; i < userUpdates.length; i++) {
					const user = userUpdates[i].Username;
					const sendSaves = (watchers) => {
						for (const watcher of watchers) {
							this.sendSave(watcher, userUpdates[i]);
						}
					};
					if (LEGACY) {
						sendSaves(this.watch.users[user].map(user =>
							new Channel(
								Channel.TYPE_IRC,
								new Channel.IrcChannelData(
									user,
									this.env.ircCli
								)
							)
						));
					}
					else {
						this.db.all(
							`SELECT watcher FROM user_watches WHERE watchee = (?) UNION ALL SELECT watcher FROM user_comment_watches WHERE watchee = (?)`,
							[user, user + '+'],
							(err, rows) => {
								if (err) {
									console.error(err);
									return;
								}
								sendSaves(rows.map(row => Channel.fromString(row.watcher, this.env.ircCli, this.env.discordCli)));
							}
						);
					}
				}
				this.doTaskAsync();
			};
			if (LEGACY) {
				const users = Object.keys(this.watch.users);
				this.getUserUpdates(users, processUpdates);
			}
			else {
				this.db.all(
					`SELECT watchee FROM user_watches UNION ALL SELECT watchee FROM user_comment_watches`,
					[],
					(err, rows) => {
						if (err) {
							console.error(err);
							return;
						}
						this.getUserUpdates(rows.map(row => row.watchee), processUpdates);
					}
				);
			}
			break;
		}
		case 'subframe':
			this.getSubframeUpdates(() => {
				this.doTaskAsync();
			});
			break;
		case 'fp':
			this.getFpUpdates((fpUpdates) => {
				for (const save of fpUpdates) {
					this.env.sendMessage(
						new Channel(Channel.TYPE_IRC,
							new Channel.IrcChannelData(
								'#powder-subframe',
								this.env.ircCli
							)
						),
						`Subframe FP Update; http://tpt.io/~${save.ID}`
					);
				}
				this.doTaskAsync();
			});
			break;
		case 'commentsSweep': {
			const processCommentUpdates = (numSaves, commentUpdates) => {
				this.currCommentsSweepPage++;
				if (this.currCommentsSweepPage * 16 > numSaves) {
					this.currCommentsSweepPage = 0;
					this.currCommentsSweepUserIndex++;
				}
				for (const updateData of commentUpdates) {
					// console.log(`fetching ${updateData.newComments} comments for save ${updateData.save.ID}`);
					this.taskStack.push({
						type: 'comments',
						save: updateData.save,
						newComments: updateData.newComments
					});
				}
				this.doTaskAsync();
			};
			const processWatchedUsers = (users) => {
				if (users.length == 0)
					this.doTaskAsync();
				if (this.currCommentsSweepUserIndex >= users.length) {
					this.currCommentsSweepUserIndex = 0;
				}
				this.getCommentUpdates(
					users[this.currCommentsSweepUserIndex],
					this.currCommentsSweepPage,
					processCommentUpdates
				);
			};
			if (LEGACY) {
				const users = Object.keys(this.watch.comments).sort();
				processWatchedUsers(users);
			}
			else {
				this.db.all(
					`SELECT watchee FROM user_comment_watches`,
					[],
					(err, rows) => {
						if (err) {
							console.error(err);
							return;
						}
						processWatchedUsers(rows.map(row => row.watchee));
					}
				);
			}
			break;
		}
		case 'comments':
			this.getComments(currTask.save, currTask.newComments,
				(commentUpdates) => {
					const sendComments = (watchers) => {
						for (const watcher of watchers) {
							// assume nick is the same as powder toy
							// username for this simple filter
							const commentByUser = (comment) =>
								(comment.Username.toLowerCase() == watcher.name.toLowerCase());
							if (commentUpdates.every(commentByUser))
								continue;
							this.env.sendMessage(
								watcher,
								`New comments for '${currTask.save.Name}'; http://tpt.io/~${currTask.save.ID}`
							);
							for (let i = commentUpdates.length - 1; i >= 0; i--) {
								const comment = commentUpdates[i];
								if (commentByUser(comment))
									continue;
								this.env.sendMessage(
									watcher,
									`<${comment.Username}> ${comment.Text}`
								);
							}
						}
					};
					// console.log(`announcing ${commentUpdates.length} comments for save ${currTask.save.ID}`);
					if (LEGACY) {
						const watchers = Object.keys(this.watch.comments[currTask.save.Username]).map(user =>
							new Channel(
								Channel.TYPE_IRC,
								new Channel.IrcChannelData(
									user,
									this.env.ircCli
								)
							)
						);
						sendComments(watchers);
					}
					else {
						this.db.all(
							`SELECT watcher FROM user_comment_watches WHERE watchee = (?) UNION ALL SELECT watcher FROM comment_watches WHERE watchee = (?)`,
							[currTask.save.Username, `~${currTask.save.ID}`],
							(err, rows) => {
								if (err) {
									console.error(err);
									return;
								}
								sendComments(rows.map(row =>
									Channel.fromString(row.watcher, this.env.ircCli, this.env.discordCli)
								));
							}
						);
					}
					this.cache.comments[currTask.save.ID] = currTask.save.Comments;
					this.saveCache();
					this.db.run(
						`INSERT OR REPLACE INTO save_cache(save_id, num_comments_seen) VALUES (?, ?)`,
						[currTask.save.ID, currTask.save.Comments],
						(err) => {
							if (err)
								console.error(err);
							this.doTaskAsync();
						}
					);
				});
			break;
		default:
			throw 'Task type not recognized: ' + currTask.type.toString();
			break;
		}
	}
	refreshTaskList(){
		this.taskStack = [];
		this.taskStack.push({
			type: 'subframe'
		});
		this.taskStack.push({
			type: 'user'
		});
		this.taskStack.push({
			type: 'fp'
		});
		this.taskStack.push({
			type: 'commentsSweep'
		});
	}
	sendSave(returnChannel, save){
		if ('PublishedTime' in save) {
			const updatedType = (save.PublishedTime == save.Updated) ?
				'New' : 'Updated';
			this.env.sendMessage(returnChannel,
				`${updatedType}: '${save.Name}' by ${save.Username}; http://tpt.io/~${save.ID}`);
		}
		else{
			this.env.sendMessage(returnChannel,
				`'${save.Name}' by ${save.Username}; http://tpt.io/~${save.ID}`);
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
				console.error(err);
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
				console.error(err);
				onComplete();
				return false;
			}
			if (!body.Saves) {
				console.log('unable to get subframe updates');
				onComplete();
				return false;
			}

			const currTime = new Date().getTime();
			let placeholders = [];
			let values = [];
			for (let i = 0; i < body.Saves.length; i++) {
				const saveId = body.Saves[i].ID;
				const updatedTime = body.Saves[i].Updated;
				if (currTime / 1000 - updatedTime > FP_EXPIRE_TIME_SECONDS)
					continue;
				if (!(saveId in this.cache.subframe)) {
					this.cache.subframe[saveId] = {
						state: 0,
						updated: body.Saves[i].Updated
					};
				}
				placeholders.push('(?, ?, 0)');
				values.push([saveId, updatedTime]);
			}
			this.saveCache();
			this.db.run(
				`INSERT OR IGNORE INTO fp_cache(save_id, last_updated, reported) VALUES ${placeholders.join(',')}`,
				[].concat(...values),
				(err) => {
					if (err)
						console.error(err);
					onComplete();
				}
			);
		});
	}
	getFpUpdates(handleUpdates){
		const searchReq = `http://powdertoy.co.uk/Browse.json`;
		request(searchReq, {
			json: true
		}, (err, resp, body) => {
			if (err) {
				console.error(err);
				handleUpdates([]);
				return false;
			}
			if (!body.Saves) {
				console.error('PowderPlugin: no Saves in body');
				console.error(body);
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
			const expiryTime =
				parseInt(currTime / 1000) - FP_EXPIRE_TIME_SECONDS;
			for (const saveId in this.cache.subframe) {
				const updatedTime = this.cache.subframe[saveId].updated;
				if (updatedTime < expiryTime) {

					delete this.cache.subframe[saveId];
				}
			}
			this.saveCache();
			this.db.run(
				`DELETE FROM fp_cache WHERE last_updated < ${expiryTime.toString()}`
			);
			handleUpdates(res);
		});
	}
	getCommentUpdates(user, pageNum, handleUpdates){
		const searchReq =
			`http://powdertoy.co.uk/Browse.json?Search_Query=user%3A${user}+sort%3Adate&PageNum=${pageNum}`;
		request(searchReq, {
			json: true
		}, (err, resp, body) => {
			if (err) {
				console.error(err);
				handleUpdates(0, []);
				return false;
			}
			if (!body.Saves) {
				console.error('PowderPlugin: no Saves in body');
				console.error(body);
				handleUpdates(0, []);
				return false;
			}
			const res = [];
			for (let i = 0; i < body.Saves.length; i++) {
				const saveId = body.Saves[i].ID;
				let cacheCommentCount = 0;
				if (saveId in this.cache.comments) {
					cacheCommentCount = this.cache.comments[saveId];
				}
				// console.log(`found ${body.Saves[i].Comments} comments for save ${saveId} (${cacheCommentCount} in cache)`);
				if (body.Saves[i].Comments > cacheCommentCount) {
					res.push({
						save: body.Saves[i],
						newComments: body.Saves[i].Comments -
							cacheCommentCount
					});
				}
			}
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
				console.error(err);
				handleUpdates([]);
				return false;
			}
			handleUpdates(body);
		});
	}
	getSave(saveId, handleSave){
		const searchReq =
			`http://powdertoy.co.uk/Browse/View.json?ID=${saveId.toString()}`;
		request(searchReq, {
			json: true
		}, (err, resp, body) => {
			if (err) {
				console.error(err);
				handleSave(null);
				return false;
			}
			handleSave(body);
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
	querySave(saveId, returnChan) {
		this.highPriorityTaskStack.push({
			type: 'querySave',
			saveId: saveId,
			returnChan: returnChan
		});
		this.update();
	}
	handleMessage(user, chan, msg) {
		if (chan.hasPowderBotInsecure())
			return;
		const match = /^~([\d]+)(?:\s|$)/.exec(msg);
		if (match == null)
			return;
		if (match.length != 2)
			throw new Error('match should have length 2');
		const replyChan = Channel.getReplyChan(chan, user);
		this.querySave(parseInt(match[1]), replyChan);
	}
	handleCommand(cmd, argstring, returnChannel, sender){
		if(cmd in this.cmds){
			this.cmds[cmd](returnChannel, argstring, sender);
		}
	}
};

PowderPlugin.REGEX_USERNAME = /^[a-zA-Z0-9-_]+$/;
PowderPlugin.REGEX_USERNAME_PLUS = /^([a-zA-Z0-9-_]+)\+$/;
PowderPlugin.REGEX_SAVE_ID = /^~([0-9]+)$/;

module.exports = PowderPlugin;
