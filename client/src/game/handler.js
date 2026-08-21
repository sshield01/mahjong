import Schema, { player, eq } from "../lib/schema.js";
import { get } from "svelte/store";

const TIMER_DURATION = 4000;

function hasActions(schema, myWind) {
  if (!schema.discarded && schema.discarded !== 0) return false;
  if (schema.previousTurn === myWind) return false;
  const discard = schema.tiles[schema.discarded];
  const isWild = (t) => schema.wildcard && eq(t, schema.wildcard);
  if (isWild(discard)) return false;
  const hand = schema[myWind].up;
  const handTiles = hand.map(t => schema.tiles[t]);
  const matching = handTiles.filter(t => eq(t, discard));
  if (matching.length >= 2) return true;
  if (schema.turn === myWind && typeof discard.value === 'number') {
    const ofSuit = handTiles.filter(t => t.suit === discard.suit && !isWild(t));
    const vals = ofSuit.map(t => t.value);
    if (vals.includes(discard.value - 2) && vals.includes(discard.value - 1)) return true;
    if (vals.includes(discard.value - 1) && vals.includes(discard.value + 1)) return true;
    if (vals.includes(discard.value + 1) && vals.includes(discard.value + 2)) return true;
  }
  const playerObj = { ...schema[myWind] };
  playerObj.up = [...hand, schema.discarded];
  if (Schema.winningHand(schema, playerObj, schema.discarded)) return true;
  return false;
}

export default async function handler(
  schema,
  { socket, store, timer, selection, selectionSets, currentVotes },
) {
  store.set(new Schema(schema));
  for (;;) {
    const message = await socket.recv();

    const schema = new Schema(get(store));
    switch (message.subject) {
      case "addPlayer": {
        const { position, name } = message.body;
        schema[position] = player(name);
        store.set(schema);
        break;
      }
      case "removePlayer": {
        const { position } = message.body;
        delete schema[position];
        store.set(schema);
        break;
      }
      case "readyPlayer": {
        if (!schema.started) {
          const { position, ready } = message.body;
          schema[position].ready = ready;
          store.set(schema);
        }
        break;
      }
      case "start": {
        store.set(new Schema(message.body));
        break;
      }
      case "discard": {
        const { position, tile, reveal, hasClaims } = message.body;
        currentVotes.set({ [position]: { method: "Discard", priority: 0 } });
        schema.tiles[tile] = reveal;
        const index = schema[position].up.indexOf(tile);
        schema[position].up.splice(index, 1);
        schema[position].discarded.push(tile);
        schema.discarded = tile;
        delete schema.drawn;
        schema.nextTurn();
        store.set(schema);
        const myWind = schema.playerWind(socket.name);
        if (position !== myWind && !hasActions(schema, myWind)) {
          if (hasClaims) {
            setTimeout(() => {
              if (schema.turn === myWind) {
                socket.send("draw").catch(() => {});
              } else {
                socket.send("ignore").catch(() => {});
              }
            }, 4000);
          } else {
            if (schema.turn === myWind) {
              socket.send("draw").catch(() => {});
            } else {
              socket.send("ignore").catch(() => {});
            }
          }
        }
        break;
      }
      case "draw": {
        window.clearTimeout((get(timer) || {}).handle);
        selectionSets.set([]);
        selection.set(new Set());
        timer.set(null);
        const { tile, wall, stack, reveal } = message.body;
        if (reveal) {
          schema.tiles[tile] = reveal;
        }
        schema.walls[wall][stack].pop();
        schema[schema.turn].up.push(tile);
        schema.drawn = tile;
        schema.source = "front";
        delete schema.discarded;
        store.set(schema);
        break;
      }
      case "take": {
        window.clearTimeout((get(timer) || {}).handle);
        selectionSets.set([]);
        selection.set(new Set());
        timer.set(null);
        const { position, wall, stack, tiles, reveal } = message.body;
        schema[position].down.push(tiles);
        schema[schema.previousTurn].discarded.pop();
        for (const [index, tile] of reveal) {
          schema.tiles[index] = tile;
        }
        for (const tile of tiles) {
          const index = schema[position].up.indexOf(tile);
          if (index !== -1) schema[position].up.splice(index, 1);
        }
        if (wall !== undefined && stack !== undefined) {
          schema.drawn = schema.walls[wall][stack].pop();
          schema[position].up.push(schema.drawn);
          schema.source = "back";
        } else {
          schema.drawn = schema.discarded;
          schema.source = "discard";
        }
        delete schema.discarded;
        schema.turn = position;
        store.set(schema);
        break;
      }
      case "kong": {
        const { position, wall, stack, tiles, meld, reveal } = message.body;
        if (meld === undefined) {
          schema[position].down.push(tiles);
        } else {
          schema[position].down[meld].push(...tiles);
        }
        for (const [index, tile] of reveal) {
          schema.tiles[index] = tile;
        }
        for (const tile of tiles) {
          const index = schema[position].up.indexOf(tile);
          if (index !== -1) schema[position].up.splice(index, 1);
        }
        schema.drawn = schema.walls[wall][stack].pop();
        schema.source = "back";
        schema[position].up.push(schema.drawn);
        store.set(schema);
        break;
      }
      case "vote": {
        const { position, vote } = message.body;
        currentVotes.update((votes) => ({ ...votes, [position]: vote }));
        if (!get(timer)) {
          const myWind = schema.playerWind(socket.name);
          if (schema.turn !== myWind) {
            timer.set({
              start: Date.now(),
              paused: false,
              duration: TIMER_DURATION,
              handle: window.setTimeout(async () => {
                if (get(currentVotes)[myWind]) return;
                try {
                  await socket.send("ignore");
                } catch (error) {
                  console.error(error);
                }
              }, TIMER_DURATION),
            });
          }
        }
        break;
      }
      case "exposeWildcard": {
        const { position, tile, reveal } = message.body;
        if (reveal) schema.tiles[tile] = reveal;
        if (!schema[position].exposedWildcards) schema[position].exposedWildcards = [];
        schema[position].exposedWildcards.push(tile);
        store.set(schema);
        break;
      }
      case "win": {
        window.clearTimeout((get(timer) || {}).handle);
        selectionSets.set([]);
        selection.set(new Set());
        timer.set(null);
        const { position, eyes, reveal, kong, scores } = message.body;
        schema.turn = position;
        schema.tiles = reveal;
        schema.completed = true;
        if (scores) schema.scores = scores;
        if (eyes !== undefined) {
          for (const tile of eyes) {
            const index = schema[position].up.indexOf(tile);
            if (index !== -1) schema[position].up.splice(index, 1);
          }
          schema[position].down.push(eyes);
          schema[schema.previousTurn].discarded.pop();
          schema.source = "discard";
        }
        if (kong) {
          schema.source = "kong";
        }
        delete schema.discarded;
        store.set(schema);
        break;
      }
      default:
        console.warn(`Message went unhandled!`);
    }
  }
}
