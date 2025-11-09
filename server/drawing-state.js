// drawing-state.js
// Manages an ordered log of operations (in-memory). Assigns sequence numbers and supports undo/redo markers.

class DrawingState {
  constructor(){
    this.log = []; // ordered array of ops
    this.nextSeq = 1;
    // map opId -> index in log (for quick lookup)
    this.indexById = new Map();
  }

  assignSeq(op){
    if(!op.id) op.id = this._makeId();
    if(!op.seq) op.seq = this.nextSeq++;
    return op;
  }

  _makeId(){
    return Math.random().toString(36).slice(2,10);
  }

  pushOp(op){
    // assign id/seq if missing
    this.assignSeq(op);
    this.indexById.set(op.id, this.log.length);
    this.log.push(op);
    return op;
  }

  // Mark target op as undone by creating an undo op.
  // An undo is itself an op that references targetId.
  addUndo(userId, targetId){
    const undoOp = { type: 'undo', id: this._makeId(), seq: this.nextSeq++, userId, targetId, ts: Date.now() };
    this.indexById.set(undoOp.id, this.log.length);
    this.log.push(undoOp);
    return undoOp;
  }

  addRedo(userId, targetId){
    const redoOp = { type: 'redo', id: this._makeId(), seq: this.nextSeq++, userId, targetId, ts: Date.now() };
    this.indexById.set(redoOp.id, this.log.length);
    this.log.push(redoOp);
    return redoOp;
  }

  // Return the canonical list of ops to replay onto a canvas, applying undo/redo semantics.
  // For simplicity: maintain a set of undone ops according to latest undo/redo markers.
  getReplayOps(){
    const undone = new Set();
    // scan log in order and apply markers
    for(const op of this.log){
      if(op.type === 'undo'){
        undone.add(op.targetId);
      } else if(op.type === 'redo'){
        undone.delete(op.targetId);
      }
    }
    // include ops that are drawing ops and not undone
    return this.log.filter(op => {
      if(op.type === 'undo' || op.type === 'redo') return false;
      // drawing ops are considered when they have points or mode
      if(op.id && undone.has(op.id)) return false;
      return true;
    });
  }

  // Retrieve full log (for clients wanting authoritative history)
  getLog(){
    return this.log.slice();
  }

  clear(){ this.log = []; this.nextSeq = 1; this.indexById.clear(); }
}

module.exports = DrawingState;
