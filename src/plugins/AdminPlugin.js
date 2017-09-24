class AdminPlugin {
    constructor(env){
        this.env = env;
        this.client = this.env.client;
        this.cmds = {
            'die': (returnChannel, argstring, msgInfo) => {
                this.client.disconnect('*BOOM*');
            },
            'join': (returnChannel, argstring, msgInfo) => {
                this.client.join(argstring);
            },
            'part': (returnChannel, argstring, msgInfo) => {
                const [channel, partMsg] = this.env.extractCmd(argstring);
                this.client.part(channel, partMsg);
            },
            'say': (returnChannel, argstring, msgInfo) => {
                let [channel, message] = this.env.extractCmd(argstring);
                if(channel == '~') channel = returnChannel;
                this.env.sendMessage(channel, message);
            },
            'raw': (returnChannel, argstring, msgInfo) => {
                this.client.send(...argstring.split(' '));
            },
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
        else{
            if(cmd == 'die' && !msgInfo.inQuery){
                this.client.send('kick', returnChannel, msgInfo.sender, 'YOU die!');
            }
        }
    }
};

module.exports = AdminPlugin;
