class Message {
	constructor(type, val) {
		this.type = type;
		this.val = val;
	}
	get content(){
		switch(this.type) {
		case Message.TYPE_IRC:
			return this.val;
		case Message.TYPE_DISCORD:
			return this.val.content;
		default:
			throw new Error('unrecognized message type');
		}
	}
	get attachments() {
		switch(this.type) {
		case Message.TYPE_IRC:
			return [];
		case Message.TYPE_DISCORD:
			return [...this.val.attachments.values()];
		default:
			throw new Error('unrecognized message type');
		}
	}
	get isWebhook() {
		switch (this.type) {
		case Message.TYPE_IRC:
			return false;
		case Message.TYPE_DISCORD:
			return this.val.webhookId != undefined;
		default:
			throw new Error('unrecognized channel type');
		}
	}
};

Message.TYPE_IRC = 0;
Message.TYPE_DISCORD = 1;

module.exports = Message;
