const config = require('../config.js');
const DEFAULT_GROUPS = new Map();
(() => {
    const DEFAULT_GROUPS_ARR = new Map(config.PERMISSION_GROUPS);
    for(const [group, userList] of DEFAULT_GROUPS_ARR){
        const hostmaskMap = new Map();
        for(const user of userList){
            if(!hostmaskMap.has(user.username)){
                hostmaskMap.set(user.username, new Set());
            }
            hostmaskMap.get(user.username).add(user.hostmask);
        }
        DEFAULT_GROUPS.set(group, hostmaskMap);
    }
})();

class PermissionsManager {
    constructor(){
        this.groups = DEFAULT_GROUPS;
    }
    inGroup(user, group){
        const hostmaskMap = this.groups.get(group);
        return hostmaskMap.has(user.username) &&
            hostmaskMap.get(user.username).has(user.hostmask);
    }
    isAdmin(user){
        return this.inGroup(user, 'admin');
    }
};

module.exports = PermissionsManager;
