// rooms.js — simple in-memory room manager
const DrawingState = require('./drawing-state');

class Room {
  constructor(id){
    this.id = id;
    this.clients = new Map(); // clientId -> ws
    this.state = new DrawingState();
    this.users = {}; // userId -> {name,color}
  }

  addClient(clientId, ws, userInfo){
    this.clients.set(clientId, ws);
    if(userInfo && userInfo.userId){
      this.users[userInfo.userId] = { name: userInfo.name || 'anon', color: userInfo.color || null };
    }
  }

  removeClient(clientId){
    this.clients.delete(clientId);
    // Not removing user from users map because multiple tabs could belong to same user.
  }

  broadcast(msg, excludeClientId){
    const data = JSON.stringify(msg);
    for(const [cid, ws] of this.clients.entries()){
      if(cid === excludeClientId) continue;
      try{ ws.send(data); }catch(e){ console.warn('ws send fail', e) }
    }
  }
}

class RoomManager{
  constructor(){
    this.rooms = new Map();
  }
  getRoom(roomId){
    if(!this.rooms.has(roomId)) this.rooms.set(roomId, new Room(roomId));
    return this.rooms.get(roomId);
  }
}

module.exports = new RoomManager();
