import { setContext, getContext } from "svelte";
import { writable, get } from "svelte/store";

const CONTEXT = Symbol();

export function init(socket) {
  // A styled in-app confirmation, so a "are you sure?" reads in the game's own
  // Chinese UI rather than the browser's native `confirm()` dialog. `pendingConfirm`
  // holds the live request for the modal to render; `confirm(message)` returns a
  // promise that resolves true/false once the player answers.
  const pendingConfirm = writable(null);
  function confirm(message) {
    return new Promise((resolve) => {
      pendingConfirm.set({
        message,
        answer(ok) {
          pendingConfirm.set(null);
          resolve(ok);
        },
      });
    });
  }

  setContext(CONTEXT, {
    socket,
    pendingConfirm,
    confirm,
    // The name the server knows us by. Mirrors `socket.name`, but as a store, so
    // components re-resolve their seat the moment it changes -- `socket.name` is
    // a plain property and the `addPlayer` broadcast can arrive before it updates.
    myName: writable(null),
    store: writable(null),
    timer: writable(null),
    selection: writable(new Set()),
    selectionSets: writable([]),
    currentVotes: writable({}),
    hasAction: writable(false),
    // The click handler for the current discard, published by Tiles.svelte so the
    // DiscardInfo tile can offer the same claim without hunting for the small
    // tile buried in the discard pile. Null when there is nothing to claim.
    discardAction: writable(null),
    // Names of seated players whose connection has dropped. Their seat is held
    // for them and auto-played meanwhile; they can reclaim it by name.
    absent: writable(new Set()),
  });

  window.schema = () => get(store);
}

export default function () {
  return getContext(CONTEXT);
}
