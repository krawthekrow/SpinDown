const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');

const config = require('../../config.js').PLUGINS_CONFIG.GENERAL;

const OBSERVATIONS_FILENAME = config.OBSERVATIONS_FILENAME;
if(!fs.existsSync(OBSERVATIONS_FILENAME)){
    mkdirp(path.dirname(OBSERVATIONS_FILENAME));
    fs.writeFileSync(OBSERVATIONS_FILENAME, '');
}
const OBSERVATIONS = fs.readFileSync(OBSERVATIONS_FILENAME).toString().split('\n');
OBSERVATIONS.pop();

class GeneralPlugin{
    constructor(env){
        this.env = env;
        this.observations = OBSERVATIONS;
        this.cmds = {
            'ping': (returnChannel, argstring, msgInfo) => {
                this.env.sendHighlight(returnChannel, msgInfo.sender, 'Pong! :D');
            },
            'echo': (returnChannel, argstring, msgInfo) => {
                const zws = '\u200b';
                const echoSeparator = ' ';
                const splitMsg = argstring.split(' ');
                const lastWord = splitMsg[splitMsg.length - 1];
                if (argstring.length > 128){
                    this.env.sendAction(returnChannel, 'doesn\'t feel like echoing such a long string :(');
                    return;
                }
                this.env.sendMessage(returnChannel, zws +
                    argstring + echoSeparator +
                    '\x0314' + zws + lastWord + echoSeparator + '\x03' +
                    '\x0315' + zws + lastWord + echoSeparator + '\x03' +
                    '\x0300' + zws + lastWord + echoSeparator.trimRight() + '\x03'
                );
            },
            'observe': (returnChannel, argstring, msgInfo) => {
                let result = '';
                if(this.observations.length == 0 || Math.random() < 0.4){
                    if(Math.random() < 0.5)
                        result = 'Spin up!';
                    else
                        result = 'Spin down!';
                }
                else{
                    result = this.observations[parseInt(Math.floor(Math.random() * this.observations.length))];
                }
                this.env.sendHighlight(returnChannel, msgInfo.sender, result);
            },
            'addobs': (returnChannel, argstring, msgInfo) => {
                this.observations.push(argstring);
                this.saveObservations();
                this.env.sendHighlight(returnChannel, msgInfo.sender, 'Observation added.');
            },
            'getobs': (returnChannel, argstring, msgInfo) => {
                const argint = parseInt(argstring);
                if(!isNaN(argint) && argint >= 0){
                    if(argint < this.observations.length)
                        this.env.sendHighlight(returnChannel, msgInfo.sender, this.observations[argint]);
                    else
                        this.env.sendHighlight(returnChannel, msgInfo.sender, 'Only ' + this.observations.length + ' observations! Add a new one with addobs.');
                }
                else
                    this.env.printHelp(returnChannel, 'getobs', msgInfo);
            },
            'shrug': (returnChannel, argstring, msgInfo) => {
                this.env.sendMessage(returnChannel, String.raw`¯\_(ツ)_/¯`);
            },
            'supershrug': (returnChannel, argstring, msgInfo) => {
                this.env.sendMessage(returnChannel, '_shrug');
                this.env.sendMessage(returnChannel, '!shrug');
                this.env.sendMessage(returnChannel, ';shrug');
                this.env.sendMessage(returnChannel, '&shrug');
                this.env.sendMessage(returnChannel, String.raw`¯\_(ツ)_/¯`);
            },
            'explode': (returnChannel, argstring, msgInfo) => {
                this.env.sendAction(returnChannel, 'explodes \u0002' + argstring + '\u0002');
            },
            'poke': (returnChannel, argstring, msgInfo) => {
                if(argstring == '')
                    this.env.sendMessage(returnChannel, 'pokepokepokepokepoke');
                else
                    this.env.sendAction(returnChannel, 'POKES \u0002' + argstring + '\u0002');
            }
        };
    }
    handleCommand(cmd, argstring, returnChannel, msgInfo){
        if(cmd in this.cmds){
            this.cmds[cmd](returnChannel, argstring, msgInfo);
        }
    }
    saveObservations(){
        fs.writeFileSync(OBSERVATIONS_FILENAME, this.observations.join('\n'));
    }
};

module.exports = GeneralPlugin;
