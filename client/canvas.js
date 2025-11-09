// canvas.js — handles drawing with an overlay, local history, remote in-progress strokes, and replay from server log
(function(window){
  const AppCanvas = {};

  function createId(){ return Math.random().toString(36).slice(2,9); }

  function getCanvasElements(){
    return {
      base: document.getElementById('draw-canvas'),
      overlay: document.getElementById('overlay-canvas'),
      cursorsLayer: document.getElementById('cursors-layer')
    };
  }

  function setupSize(canvas){
    function resize(){
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if(canvas.width !== w || canvas.height !== h){
        // preserve by scaling image
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width || w;
        tmp.height = canvas.height || h;
        tmp.getContext('2d').drawImage(canvas,0,0);
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(tmp,0,0, tmp.width, tmp.height, 0,0, canvas.width, canvas.height);
      }
    }
    window.addEventListener('resize', resize);
    resize();
  }

  function drawStrokeToCtx(ctx, points, opts){
    if(!points || points.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = opts.width || 4;
    if(opts.mode === 'eraser'){
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = opts.color || '#000';
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if(points.length === 1){ ctx.lineTo(points[0].x+0.1, points[0].y+0.1); }
    for(let i=1;i<points.length;i++){
      const prev = points[i-1];
      const curr = points[i];
      const midx = (prev.x + curr.x)/2;
      const midy = (prev.y + curr.y)/2;
      ctx.quadraticCurveTo(prev.x, prev.y, midx, midy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function History(){ this.ops = []; }
  History.prototype.push = function(op){ this.ops.push(op); };
  History.prototype.clear = function(){ this.ops = []; };

  AppCanvas.create = function(opts){
    const els = getCanvasElements();
    const base = els.base, overlay = els.overlay, cursorsLayer = els.cursorsLayer;
    const baseCtx = base.getContext('2d');
    const overlayCtx = overlay.getContext('2d');
    setupSize(base); setupSize(overlay);

    const state = {
      wsSend: opts.wsSend || function(){},
      userId: opts.userId || createId(),
      color: '#000', width: 4, mode: 'brush',
      drawing: false, currentPoints: [],
      remotes: {}, // userId -> { points: [], color, width, mode }
      history: new History()
    };

    function pointerToCanvas(e){
      const rect = base.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - rect.left) * (base.width / rect.width), y: (p.clientY - rect.top) * (base.height / rect.height) };
    }

    function renderOverlay(){
      // clear overlay
      overlayCtx.clearRect(0,0,overlay.width, overlay.height);
      // draw remote in-progress strokes
      Object.keys(state.remotes).forEach(uid =>{
        const r = state.remotes[uid];
        if(r && r.points && r.points.length){
          drawStrokeToCtx(overlayCtx, r.points, { color: r.color||'#d00', width: r.width||state.width, mode: r.mode||'brush'});
        }
      });
      // draw local current stroke on top
      if(state.currentPoints && state.currentPoints.length){
        drawStrokeToCtx(overlayCtx, state.currentPoints, { color: state.color, width: state.width, mode: state.mode });
      }
    }

    function commitOpToBase(op){
      drawStrokeToCtx(baseCtx, op.points, { color: op.color, width: op.width, mode: op.mode });
      state.history.push(op);
    }

    // rebuild base canvas from authoritative log
    AppCanvas.rebuildFromLog = function(log){
      baseCtx.clearRect(0,0,base.width, base.height);
      state.history.clear();
      if(!Array.isArray(log)) return;
      // apply only drawing ops
      for(const op of log){
        if(op.type === 'undo' || op.type === 'redo') continue;
        if(op.points && op.points.length){
          commitOpToBase(op);
        }
      }
    };

    AppCanvas.setTool = function(tool){ state.mode = tool; };
    AppCanvas.setColor = function(c){ state.color = c; };
    AppCanvas.setWidth = function(w){ state.width = w; };
    AppCanvas.getUserId = function(){ return state.userId; };

    // Undo/redo - send target opId (last op by this user) and request authoritative log
    function findLastOpByUser(userId){
      const arr = state.history.ops;
      for(let i = arr.length - 1; i >= 0; i--){
        const op = arr[i];
        if(op && op.userId === userId){
          return op.id;
        }
      }
      return null;
    }

    AppCanvas.lastUndone = null;
    AppCanvas.undo = function(){
      const target = findLastOpByUser(state.userId);
      if(!target) return;
      state.wsSend({ type: 'undo', payload: { opId: target } });
      AppCanvas.lastUndone = target;
      // request authoritative log to rebuild canvas
      state.wsSend({ type: 'get_log' });
    };

    AppCanvas.redo = function(){
      const target = AppCanvas.lastUndone;
      if(!target) return;
      state.wsSend({ type: 'redo', payload: { opId: target } });
      AppCanvas.lastUndone = null;
      state.wsSend({ type: 'get_log' });
    };

    // Remote strokes handling
    AppCanvas.remoteStart = function(userId, meta, point){
      state.remotes[userId] = { points: [point], color: meta.color, width: meta.width, mode: meta.mode };
      renderOverlay();
    };
    AppCanvas.remoteUpdate = function(userId, point){
      const r = state.remotes[userId]; if(!r) return; r.points.push(point); renderOverlay();
    };
    AppCanvas.remoteEnd = function(userId, op){
      // apply to base and remove remote buffer
      if(op){ commitOpToBase(op); }
      delete state.remotes[userId]; renderOverlay();
    };

    // Incoming remote cursor updates
    AppCanvas.updateRemoteCursor = function(uid, pos){
      // simple rendering: create a dot element
      const existing = document.getElementById('cursor-' + uid);
      const rect = base.getBoundingClientRect();
      const left = (pos.x * (rect.width / base.width));
      const top = (pos.y * (rect.height / base.height));
      if(existing){ existing.style.left = left + 'px'; existing.style.top = top + 'px'; } else {
        const el = document.createElement('div'); el.id = 'cursor-' + uid; el.className = 'remote-cursor'; el.style.position = 'absolute'; el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.width = '14px'; el.style.height = '14px'; el.style.transform = 'translate(-50%,-50%)'; el.style.borderRadius='50%'; el.style.background = pos.color || '#f00'; el.title = pos.name || uid; cursorsLayer.appendChild(el);
      }
    };

    // Pointer handlers (local)
    function onPointerDown(e){ e.preventDefault(); const p = pointerToCanvas(e); state.drawing = true; state.currentPoints = [p]; state.wsSend({ type: 'stroke_start', payload: { color: state.color, width: state.width, mode: state.mode, point: p } }); renderOverlay(); }
    function onPointerMove(e){ const p = pointerToCanvas(e); state.wsSend({ type: 'pointer_move', payload: { point: p } }); if(!state.drawing) return; state.currentPoints.push(p); state.wsSend({ type: 'stroke_update', payload: { point: p } }); renderOverlay(); }
    function onPointerUp(e){ if(!state.drawing) return; state.drawing = false; const op = { id: createId(), userId: state.userId, points: state.currentPoints.slice(), color: state.color, width: state.width, mode: state.mode, ts: Date.now() }; // commit locally and send
      commitOpToBase(op); renderOverlay(); state.currentPoints = []; state.wsSend({ type: 'stroke_end', payload: { op } }); }

    base.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    base.addEventListener('touchstart', onPointerDown, { passive:false });
    window.addEventListener('touchmove', onPointerMove, { passive:false });
    window.addEventListener('touchend', onPointerUp);

    return AppCanvas;
  };

  window.AppCanvas = AppCanvas;
})(window);
