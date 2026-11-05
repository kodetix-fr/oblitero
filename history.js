export function createHistory(limit = 100) {
  const past = [];
  const future = [];
  return {
    push(state) {
      past.push(state);
      if (past.length > limit) past.shift();
      future.length = 0;
    },
    undo(current) {
      if (past.length === 0) return null;
      future.push(current);
      return past.pop();
    },
    redo(current) {
      if (future.length === 0) return null;
      past.push(current);
      return future.pop();
    },
    get states() {
      return [...past, ...future];
    },
    clear() {
      past.length = 0;
      future.length = 0;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
  };
}
