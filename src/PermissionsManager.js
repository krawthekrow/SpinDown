const config = require('../config.js');
const User = require('./User.js');

const DEFAULT_GROUPS = new Map();
(() => {
	const DEFAULT_GROUPS_ARR = new Map(config.PERMISSION_GROUPS);
	for(const [group, userList] of DEFAULT_GROUPS_ARR){
		const users = new Set();
		for(const user of userList){
			users.add(User.resolveConfig(user));
		}
		DEFAULT_GROUPS.set(group, users);
	}
})();

class PermissionsManager {
	constructor(){
		this.groups = DEFAULT_GROUPS;
	}
	inGroup(user, group){
		const users = this.groups.get(group);
		return users.has(user.id);
	}
	isAdmin(user){
		return this.inGroup(user, 'admin');
	}
};

module.exports = PermissionsManager;
