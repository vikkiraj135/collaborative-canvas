// server.js — minimal Express + ws server for collaborative canvas
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const uuid = require('crypto').randomUUID;
const path = require('path');
const rooms = require('./rooms');

const PORT = process.env.PORT || 3000;
const app = express();

// Serve static client files (optional)
app.use('/', express.static(path.join(__dirname, '..', 'client')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// simple mapping ws -> metadata
const clients = new Map(); // ws -> { clientId, roomId, userId }

wss.on('connection', (ws, req) =>{
  const clientId = uuid();
  clients.set(ws, { clientId });
  ws.send(JSON.stringify({ type: 'welcome', payload: { clientId } }));

  ws.on('message', (data)=>{
    let msg;
    try{ msg = JSON.parse(data); }catch(e){ console.warn('invalid JSON', e); return }
    handleMessage(ws, msg);
  });

  ws.on('close', ()=>{
    const meta = clients.get(ws) || {};
    if(meta.roomId){
      const room = rooms.getRoom(meta.roomId);
      // remove client
      room.removeClient(meta.clientId);
      // broadcast leave
      room.broadcast({ type: 'user_left', payload: { userId: meta.userId } }, null);
    }
    clients.delete(ws);
  });
});

function handleMessage(ws, msg){
  const meta = clients.get(ws) || {};
  const type = msg.type;
  const payload = msg.payload || msg; // be flexible with shape

  switch(type){
    case 'join': {
      // payload: { roomId?, name?, color?, userId? }
      const roomId = payload.roomId || 'default';
      meta.roomId = roomId;
      meta.userId = payload.userId || ('u_'+Math.random().toString(36).slice(2,8));
      meta.name = payload.name || ('anon' + Math.floor(Math.random()*1000));
      clients.set(ws, meta);
      const room = rooms.getRoom(roomId);
      room.addClient(meta.clientId, ws, { userId: meta.userId, name: meta.name, color: payload.color });

      // send join ack with assigned userId and current users list and full log
      ws.send(JSON.stringify({ type: 'join', payload: { userId: meta.userId, users: room.users, log: room.state.getLog() } }));
      // notify others
      room.broadcast({ type: 'users', payload: room.users }, meta.clientId);
      break;
    }
    case 'pointer_move': {
      // broadcast to other clients in room
      const room = rooms.getRoom(meta.roomId || 'default');
      room.broadcast({ type: 'pointer_move', payload: { userId: meta.userId, point: payload.point, name: meta.name, color: payload.color } }, meta.clientId);
      break;
    }
    case 'stroke_start': {
      // we simply forward stroke_start to others
      const room = rooms.getRoom(meta.roomId || 'default');
      room.broadcast({ type: 'stroke_start', payload: Object.assign({}, payload, { userId: meta.userId }) }, meta.clientId);
      break;
    }
    case 'stroke_update': {
      const room = rooms.getRoom(meta.roomId || 'default');
      room.broadcast({ type: 'stroke_update', payload: Object.assign({}, payload, { userId: meta.userId }) }, meta.clientId);
      break;
    }
    case 'stroke_end': {
      // payload.op expected
      const room = rooms.getRoom(meta.roomId || 'default');
      const op = Object.assign({}, payload.op || payload, { userId: meta.userId });
      // assign sequencing via drawing-state
      const savedOp = room.state.pushOp(op);
      const broadcastMsg = { type: 'stroke_end', payload: { op: savedOp } };
      room.broadcast(broadcastMsg, null);
      // acknowledge to sender with assigned seq/id
      ws.send(JSON.stringify({ type: 'stroke_ack', payload: { op: savedOp } }));
      break;
    }
    case 'get_log': {
      const room = rooms.getRoom(meta.roomId || 'default');
      ws.send(JSON.stringify({ type: 'log', payload: { log: room.state.getLog() } }));
      break;
    }
    case 'undo': {
      const room = rooms.getRoom(meta.roomId || 'default');
      // payload.opId may be provided
      const targetId = payload.opId;
      const undoOp = room.state.addUndo(meta.userId, targetId);
      // broadcast authoritative log so clients can rebuild (keeps everyone in sync)
      room.broadcast({ type: 'log', payload: { log: room.state.getLog() } }, null);
      room.broadcast({ type: 'undo', payload: { op: undoOp } }, null);
      break;
    }
    case 'redo': {
      const room = rooms.getRoom(meta.roomId || 'default');
      const targetId = payload.opId;
      const redoOp = room.state.addRedo(meta.userId, targetId);
      room.broadcast({ type: 'undo', payload: { op: undoOp } }, null);
      // after recording undo, broadcast authoritative log
      room.broadcast({ type: 'log', payload: { log: room.state.getLog() } }, null);
      break;
    }
    default:
      // broadcast generic messages for debugging
      const room = rooms.getRoom(meta.roomId || 'default');
      room.broadcast({ type: 'message', payload: msg }, meta.clientId);
      room.broadcast({ type: 'redo', payload: { op: redoOp } }, null);
      // after redo, broadcast authoritative log
      room.broadcast({ type: 'log', payload: { log: room.state.getLog() } }, null);
  }
}

server.listen(PORT, ()=>{
  console.log(`Server listening on http://localhost:${PORT}`);
});
