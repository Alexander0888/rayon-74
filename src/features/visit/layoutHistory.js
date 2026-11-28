function sameValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

export function createLayoutHistory(limit = 100) {
  const past = [], future = [];
  return {
    get buttons() { return { undo: past.length > 0, redo: future.length > 0 }; },
    record(before, after) {
      if (sameValue(before, after)) return false;
      past.push({ before, after });
      if (past.length > limit) past.shift();
      future.length = 0;
      return true;
    },
    undo() {
      const change = past.pop();
      if (!change) return null;
      future.push(change);
      return change.before;
    },
    redo() {
      const change = future.pop();
      if (!change) return null;
      past.push(change);
      return change.after;
    },
  };
}
