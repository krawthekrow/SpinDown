class ChannelManagementPlugin {
    constructor(env){
        this.env = env;
        this.ircCli = this.env.ircCli;
        this.cmds = {
            'mode': (returnChannel, argstring, sender) => {
                if (returnChannel.type != Channel.TYPE_IRC) {
                    this.env.sendHighlight(
                        returnChannel,
                        sender,
                        `This command is only enabled on IRC.`
                    );
                    return;
                }

                const args = argstring.split(' ');
                if(args.length == 1){
                    this.ircCli.send(
                        'mode', returnChannel, args[0]
                    );
                }
                else if(args.length == 2){
                    this.ircCli.send(
                        'mode', returnChannel, args[1], args[0]
                    );
                }
                else{
                    this.env.printHelp(returnChannel, 'mode', sender);
                }
            },
            'op': (returnChannel, argstring, sender) => {
                if (returnChannel.type != Channel.TYPE_IRC) {
                    this.env.sendHighlight(
                        returnChannel,
                        sender,
                        `This command is only enabled on IRC.`
                    );
                    return;
                }

                const opTarget = (argstring == '') ?
                    sender.nick : argstring;
                this.ircCli.send(
                    'mode', returnChannel, '+o', opTarget
                );
            },
            'deop': (returnChannel, argstring, sender) => {
                if (returnChannel.type != Channel.TYPE_IRC) {
                    this.env.sendHighlight(
                        returnChannel,
                        sender,
                        `This command is only enabled on IRC.`
                    );
                    return;
                }

                const opTarget = (argstring == '') ?
                    sender.nick : argstring;
                this.client.send(
                    'mode', returnChannel, '-o', opTarget);
            }
        };
    }
    handleCommand(cmd, argstring, returnChannel, sender){
        if(!returnChannel.isQuery &&
            this.env.permissions.isAdmin(sender)){
            if(cmd in this.cmds){
                this.cmds[cmd](returnChannel, argstring, sender);
            }
        }
    }
};

module.exports = ChannelManagementPlugin;
