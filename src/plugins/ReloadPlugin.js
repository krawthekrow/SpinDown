class ReloadPlugin {
    constructor(env){
        this.env = env;
        this.client = this.env.client;
        this.cmds = {
            'reload': (returnChannel, argstring, msgInfo) => {
                this.env.reloadSelf();
                this.env.sendHighlight(returnChannel, msgInfo.sender, 'Reloaded!');
            }
        };
    }
    handleCommand(cmd, argstring, returnChannel, msgInfo){
        if(this.env.permissions.isAdmin(msgInfo.sender)){
            if(cmd in this.cmds){
                this.cmds[cmd](returnChannel, argstring, msgInfo);
            }
        }
    }
};

module.exports = ReloadPlugin;
