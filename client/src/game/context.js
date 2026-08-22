import { setContext, getContext } from "svelte";
import { writable, get } from "svelte/store";

const CONTEXT = Symbol();

export function init(socket) {
  setContext(CONTEXT, {
    socket,
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
  });

  window.schema = () => get(store);
}

export default function () {
  return getContext(CONTEXT);
}
