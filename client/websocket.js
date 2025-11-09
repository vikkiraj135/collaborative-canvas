// websocket.js — lightweight WS client for drawing events
(function(window){
  function WSClient(url, handlers){
    this.url = url || 'ws://localhost:3000';
    this.ws = null;
    this.handlers = handlers || {};
    this.userId = null;
  }

  WSClient.prototype.connect = function(payload){
    try{
      this.ws = new WebSocket(this.url);
    }catch(e){
      console.error('WebSocket connect failed', e);
      return;
    }
    const self = this;
    this.ws.addEventListener('open', ()=>{
      console.log('ws open');
      // send join payload
      const join = { type: 'join', payload: payload || {} };
      self.ws.send(JSON.stringify(join));
      if(self.handlers.open) self.handlers.open();
    });
    this.ws.addEventListener('message', (ev)=>{
      let msg = null;
      try{ msg = JSON.parse(ev.data) }catch(e){ console.warn('invalid ws msg', ev.data); return }
      if(self.handlers[msg.type]){
        self.handlers[msg.type](msg.payload);
      } else if(self.handlers['message']){
        self.handlers['message'](msg);
      }
    });
    this.ws.addEventListener('close', ()=>{ if(this.handlers.close) this.handlers.close() });
    this.ws.addEventListener('error', (e)=>{ if(this.handlers.error) this.handlers.error(e) });
  };

  WSClient.prototype.send = function(obj){
    if(!this.ws || this.ws.readyState !== WebSocket.OPEN){
      // early-bail: could buffer here
      return;
    }
    try{ this.ws.send(JSON.stringify(obj)); }catch(e){ console.warn('ws send failed', e) }
  };

  window.WSClient = WSClient;
})(window);
