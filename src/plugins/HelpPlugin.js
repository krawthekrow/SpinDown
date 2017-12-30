class HelpPlugin {
    constructor(env){
        this.env = env;
        this.client = this.env.client;
        this.cmds = {
            'help': (returnChannel, argstring, msgInfo) => {
                this.env.sendHighlight(
                    returnChannel, msgInfo.sender, this.getHelp(argstring)
                );
            },
            'list': (returnChannel, argstring, msgInfo) => {
                this.env.sendHighlight(
                    returnChannel, msgInfo.sender, this.getHelp(argstring)
                );
            }
        };
    }
    getHelp(query){
        if(query == ''){
            return Object.keys(HelpPlugin.HELP_CONTENT).join(', ');
        }
        for(const category in HelpPlugin.HELP_CONTENT){
            for(const cmd in HelpPlugin.HELP_CONTENT[category]){
                if(query == cmd){
                    return HelpPlugin.HELP_CONTENT[category][cmd];
                }
            }
        }
        for(const category in HelpPlugin.HELP_CONTENT){
            if(query == category){
                return Object.keys(
                    HelpPlugin.HELP_CONTENT[category]
                ).join(', ');
            }
        }
        return 'Command not found!';
    }
    handleCommand(cmd, argstring, returnChannel, msgInfo){
        if(cmd in this.cmds){
            this.cmds[cmd](returnChannel, argstring, msgInfo);
        }
    }
};

HelpPlugin.HELP_CONTENT = {
    'general': {
        'ping': 'ping -- Check if SpinDown wants to talk to you.',
        'echo': 'echo <string> -- Echo. What did you think this was?',
        'observe': 'observe -- Observe an electron. What state will it be?',
        'addobs': 'addobs <observation> -- Add an observation. Change the laws of physics!',
        'getobs': 'getobs <id> -- See the observation with index id.',
        'shrug': 'shrug -- ' + String.raw`¯\_(ツ)_/¯`,
        'supershrug': 'supershrug -- ' + String.raw`¯\_(ツ)_/¯ ¯\_(ツ)_/¯ ¯\_(ツ)_/¯ ¯\_(ツ)_/¯`,
        'explode': 'explode <thing> -- Explodes a thing.',
        'poke': 'poke <nick> -- Poke someone.'
    },
    'hangman': {
        'hmstart': 'hmstart [<channel> <solution>] -- Start a hangman game in <channel>! If you hmstart in a channel, SpinDown will choose a random common word for you.',
        'hmstop': 'hmstop -- Stop a hangman game.',
        'hmshow': 'hmshow -- Forgot something? Show all the game data again!',
        'hmguess': 'hmguess <char> -- Guess a character... did you get it right?'
    },
    'admin': {
        'die': 'die -- Kill SpinDown. Once and for all.',
        'join': 'join <channel> -- Join a channel.',
        'part': 'part <channel> <message> -- Part a channel with a message.',
        'eval': 'eval <script> -- Summon the power of Javascript.',
        'exec': 'exec <script> -- Summon the power of Bash.',
        'say': 'say <channel> <message> -- Say a message in another channel.',
        'raw': 'raw <message> -- Send a raw message.',
        'highlight': 'highlight <regex> -- Annoy everyone matching a regex.'
    },
    'channel': {
        'mode': 'mode [<nick>] <mode changes> -- Change someone\'s modes for this channel, or the channel\'s modes if <nick> is omitted.',
        'op': 'op [<nick>] -- Make someone op. If <nick> is omitted, make yourself op.',
        'deop': 'deop [<nick>] -- Make someone not op. If <nick> is omitted, make yourself not op.'
    },
    'reload': {
        'reload': 'reload -- Reload all modules.'
    },
    'help': {
        'help': 'help <query> -- Ask SpinDown for help because you\'re too lazy to figure things out yourself.',
        'list': 'list <query> -- List commands in a category, or print the help string for a command. Definitely not the same thing as help.'
    },
    'powder': {
        'pwatchadd': 'pwatchadd <users> -- Add <users> (space-separated usernames) to your watchlist.',
        'pwatchrem': 'pwatchrem <users> -- Remove <users> (space-separated usernames) from your watchlist.',
        'pwatchlist': 'pwatchlist [<nick>] -- See <nick>\'s current watchlist. If <nick> is omitted, see your own watchlist.',
        'pcacheclear': 'pcacheclear [<type>] -- Clear SpinDown\'s save cache. If <type> is provided, clear the cache specified by <type>.',
        'pwatchclear': 'pwatchclear [all] -- Clear your watchlist. If \'all\' is provided, clear everyone\'s watchlist.',
        'pcommentwatch': 'pcommentwatch <user>|@stop -- Watch for comments on any of your saves. <user> should be your TPT username. If \'@stop\' is provided, stop watching for comments.'
    }
};

module.exports = HelpPlugin;
