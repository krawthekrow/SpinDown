class ReloadPlugin {
	constructor(env){
		this.env = env;
		this.cmds = {
			'reload': (returnChannel, argstring, sender) => {
				this.env.reloadSelf();
				this.env.sendHighlight(
					returnChannel,
					sender,
					'Reloaded!'
				);
			}
		};
	}
	handleCommand(cmd, argstring, returnChannel, sender){
		if(this.env.permissions.isAdmin(sender)){
			if(cmd in this.cmds){
				this.cmds[cmd](returnChannel, argstring, sender);
			}
		}
	}
};

module.exports = ReloadPlugin;
