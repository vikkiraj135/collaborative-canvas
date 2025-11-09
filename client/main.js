// main.js — wire up UI, canvas and websocket
(function(){
  const myIdEl = document.getElementById('my-id');
  const usersCount = document.getElementById('users-count');
  const usersList = document.getElementById('users-list');
  const logLengthEl = document.getElementById('log-length');
  const lastOpIdEl = document.getElementById('last-op-id');

  const colorInput = document.getElementById('color');
  const widthInput = document.getElementById('width');
  const brushBtn = document.getElementById('tool-brush');
  const eraserBtn = document.getElementById('tool-eraser');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');

  // create a lightweight WS client
  const ws = new WSClient('ws://localhost:3000', {
    open(){ console.log('connected to ws server') },
    join(payload){
      // server assigns userId, users and may include an authoritative log
      if(payload.userId) App.userId = payload.userId;
      if(payload.users) App.users = payload.users;
      updateUIUsers();
      if(payload.log){ App.canvas.rebuildFromLog(payload.log); updateLogUI(payload.log); }
    },
    users(payload){ App.users = payload; updateUIUsers(); },
    pointer_move(payload){ if(payload.userId !== App.userId) App.canvas.updateRemoteCursor(payload.userId, {x:payload.point.x, y:payload.point.y, color:payload.color, name:payload.name}); },
    stroke_start(payload){ if(payload.userId !== App.userId) { App.canvas.remoteStart(payload.userId, payload, payload.point); } },
    stroke_update(payload){ if(payload.userId !== App.userId) { App.canvas.remoteUpdate(payload.userId, payload.point); } },
    stroke_end(payload){ if(payload && payload.op){ if(payload.op.userId !== App.userId) App.canvas.remoteEnd(payload.op.userId, payload.op); } },
    undo(payload){
      // server broadcasts undo op; request authoritative log and rebuild
      if(payload && payload.op){ console.log('undo:', payload.op); }
      ws.send({ type: 'get_log' });
    },
    redo(payload){ if(payload && payload.op){ console.log('redo:', payload.op); } ws.send({ type: 'get_log' }); },
    log(payload){ // server reply to get_log
      if(payload && payload.log){ App.canvas.rebuildFromLog(payload.log); updateLogUI(payload.log); }
    },
    message(msg){ console.log('ws msg', msg); }
  });

  const App = { users: {}, userId: null, canvas: null };

  // start ws (provide a random name and color)
  const myName = 'anon' + Math.floor(Math.random()*1000);
  const myColor = '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0');
  ws.connect({ name: myName, color: myColor });

  function updateUIUsers(){
    myIdEl.textContent = App.userId || '—';
    const keys = Object.keys(App.users || {});
    usersCount.textContent = keys.length;
    usersList.innerHTML = '';
    keys.forEach(uid =>{
      const u = App.users[uid];
      const li = document.createElement('li');
      li.className = 'user-item';
      li.innerHTML = `<div class='user-dot' style='background:${u.color||"#888"}'></div><div>${u.name||uid}${uid===App.userId? ' (you)':''}</div>`;
      usersList.appendChild(li);
    });
  }

  // initialize canvas
  const canvasObj = App.canvas = window.AppCanvas.create({ userId: null, wsSend: (obj)=>{ ws.send(obj) } });

  // propagate client color to canvas
  canvasObj.setColor(myColor);
  // notify UI of own id after join ack

  function updateLogUI(log){
    if(!Array.isArray(log)) return;
    logLengthEl.textContent = log.length;
    if(log.length > 0){
      const last = log[log.length - 1];
      lastOpIdEl.textContent = last.id || last.seq || '-';
    } else { lastOpIdEl.textContent = '-'; }
  }

  // local UI wiring
  brushBtn.addEventListener('click', ()=>{ canvasObj.setTool('brush'); brushBtn.classList.add('active'); eraserBtn.classList.remove('active'); });
  eraserBtn.addEventListener('click', ()=>{ canvasObj.setTool('eraser'); eraserBtn.classList.add('active'); brushBtn.classList.remove('active'); });
  colorInput.addEventListener('input', (e)=>{ canvasObj.setColor(e.target.value); });
  widthInput.addEventListener('input', (e)=>{ canvasObj.setWidth(parseInt(e.target.value,10)); });
  undoBtn.addEventListener('click', ()=>{ canvasObj.undo(); });
  redoBtn.addEventListener('click', ()=>{ canvasObj.redo(); });

  // expose App globally for debugging
  window.App = App;
})();
