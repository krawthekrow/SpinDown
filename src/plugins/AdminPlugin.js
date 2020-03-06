const { exec } = require('child_process');
const Channel = require('../Channel.js');

class AdminPlugin {
	constructor(env){
		this.env = env;
		this.ircCli = this.env.ircCli;
		this.discordCli = this.env.discordCli;
		this.cmds = {
			'die': (returnChannel, argstring, sender) => {
				this.sendHighlight(returnChannel, sender, `SpinDown forgot how to die :(`);
				// this.env.dispose();
				// this.client.disconnect('*BOOM*');
			},
			'join': (returnChannel, argstring, sender) => {
				this.ircCli.join(argstring);
			},
			'part': (returnChannel, argstring, sender) => {
				const [channel, partMsg] = this.env.extractCmd(argstring);
				this.ircCli.part(channel, partMsg);
			},
			'eval': (returnChannel, argstring, sender) => {
				let evalRes = null;
				try{
					evalRes = eval(argstring);
				}
				catch(e){
					this.env.sendHighlight(
						returnChannel,
						sender,
						e.message
					);
					return;
				}
				this.env.sendHighlight(
					returnChannel,
					sender,
					String(evalRes)
				);
			},
			'exec': (returnChannel, argstring, sender) => {
				exec(argstring, (err, stdout, stderr) => {
					if(err){
						console.log(err);
						return;
					}
					this.env.sendHighlight(
						returnChannel, sender, stdout
					);
					if(stderr != ''){
						this.env.sendHighlight(
							returnChannel, sender, stderr
						);
					}
				});
			},
			'say': (returnChannel, argstring, sender) => {
				let [chanSpec, message] = this.env.extractCmd(argstring);
				let chan = null;
				if (chanSpec == '~')
					chan = returnChannel;
				else
					chan = Channel.fromString(
						chanSpec, this.ircCli, this.discordCli
					);
				this.env.sendMessage(chan, message);
			},
			'raw': (returnChannel, argstring, sender) => {
				this.ircCli.send(...argstring.split(' '));
			},
			'highlight': (returnChannel, argstring, sender) => {
				if (returnChannel.isQuery) {
					this.env.sendMessage(
						returnChannel,
						'Why are you trying to highlight in private?'
					);
					return;
				}
				if (returnChannel.type != Channel.TYPE_IRC) {
					this.env.sendHighlight(
						returnChannel,
						sender,
						`This command is only enabled on IRC.`
					);
					return;
				}

				const re = new RegExp(argstring);
				this.env.sendMessage(returnChannel,
					Object.keys(this.ircCli.chans[returnChannel.val.name].users)
					.filter(nick => re.test(nick))
					.map(nick => nick + ': ').join('')
				);
			}
		};
	}
	handleCommand(cmd, argstring, returnChannel, sender){
		if(this.env.permissions.isAdmin(sender)){
			if(cmd in this.cmds){
				this.cmds[cmd](returnChannel, argstring, sender);
			}
			return;
		}

		if(cmd == 'die' && !returnChannel.isQuery){
			this.env.kick(returnChannel, sender);
			return;
		}
		if(cmd == 'highlight'){
			this.env.sendMessage(returnChannel,
				new Array(40).fill(`${sender.highlight}`)
				.join(' ')
			);
			return;
		}
	}
};

module.exports = AdminPlugin;
