class ChannelManagementPlugin {
    constructor(env){
        this.env = env;
        this.client = this.env.client;
        this.cmds = {
            'mode': (returnChannel, argstring, msgInfo) => {
                const args = argstring.split(' ');
                if(args.length == 1){
                    this.client.send(
                        'mode', returnChannel, args[0]);
                }
                else if(args.length == 2){
                    this.client.send(
                        'mode', returnChannel, args[1], args[0]);
                }
                else{
                    this.env.printHelp(returnChannel, 'mode', msgInfo);
                }
            },
            'op': (returnChannel, argstring, msgInfo) => {
                const opTarget = (argstring == '') ?
                    msgInfo.sender.nick : argstring;
                this.client.send(
                    'mode', returnChannel, '+o', opTarget);
            },
            'deop': (returnChannel, argstring, msgInfo) => {
                const opTarget = (argstring == '') ?
                    msgInfo.sender.nick : argstring;
                this.client.send(
                    'mode', returnChannel, '-o', opTarget);
            }
        };
    }
    handleCommand(cmd, argstring, returnChannel, msgInfo){
        if(!msgInfo.inQuery &&
            this.env.permissions.isAdmin(msgInfo.sender)){
            if(cmd in this.cmds){
                this.cmds[cmd](returnChannel, argstring, msgInfo);
            }
        }
    }
};

module.exports = ChannelManagementPlugin;
