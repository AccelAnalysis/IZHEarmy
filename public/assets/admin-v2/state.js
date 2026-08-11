const state = {
  session: null,
  route: null,
  navCollapsed: false,
  mobileNavOpen: false,
  pendingRequests: new Set()
};
const listeners = new Set();

export function getState() {
  return state;
}

export function updateState(changes) {
  Object.assign(state, typeof changes === 'function' ? changes({ ...state }) : changes);
  for (const listener of listeners) listener(state);
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markPending(key, pending = true) {
  if (pending) state.pendingRequests.add(key);
  else state.pendingRequests.delete(key);
  for (const listener of listeners) listener(state);
}

export function isPending(key) {
  return state.pendingRequests.has(key);
}
