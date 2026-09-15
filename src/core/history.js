// src/core/history.js — undo/redo по снапшотам состояния (ревизия 2.95)
// Commit-модель: commit() сравнивает текущее состояние с последним зафиксированным;
// если есть изменения — прежнее состояние уходит в стек undo, стек redo очищается.
// undo()/redo() применяют снапшот через applyState и перекладывают стеки.
export function createHistory({ getState, applyState, limit = 60 }) {
  const undoStack = [];
  const redoStack = [];
  let current = JSON.stringify(getState());
  const listeners = [];

  function onStacksChange(fn){ listeners.push(fn); }
  function emit(){ listeners.forEach(fn => fn(canUndo(), canRedo())); }
  function canUndo(){ return undoStack.length > 0; }
  function canRedo(){ return redoStack.length > 0; }

  function commit(){
    const s = JSON.stringify(getState());
    if (s === current) return false;
    undoStack.push(current);
    if (undoStack.length > limit) undoStack.shift();
    current = s;
    redoStack.length = 0;
    emit();
    return true;
  }

  function undo(){
    if (!canUndo()) return false;
    redoStack.push(current);
    current = undoStack.pop();
    applyState(JSON.parse(current));
    emit();
    return true;
  }

  function redo(){
    if (!canRedo()) return false;
    undoStack.push(current);
    current = redoStack.pop();
    applyState(JSON.parse(current));
    emit();
    return true;
  }

  function reset(){
    undoStack.length = 0;
    redoStack.length = 0;
    current = JSON.stringify(getState());
    emit();
  }

  return { commit, undo, redo, canUndo, canRedo, reset, onStacksChange };
}