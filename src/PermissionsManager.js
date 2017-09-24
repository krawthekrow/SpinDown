const config = require('../config.js');
const DEFAULT_GROUPS = new Map();
(() => {
    const DEFAULT_GROUPS_ARR = new Map(config.PERMISSION_GROUPS);
    for(const [group, userList] of DEFAULT_GROUPS_ARR){
        DEFAULT_GROUPS.set(group, new Set(userList));
    }
})();

class PermissionsManager {
    constructor(){
        this.groups = DEFAULT_GROUPS;
    }
    inGroup(user, group){
        return this.groups.get(group).has(user);
    }
    isAdmin(user){
        return this.inGroup(user, 'admin');
    }
};

module.exports = PermissionsManager;
