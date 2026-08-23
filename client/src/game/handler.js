import Schema, { player, eq } from "../lib/schema.js";
import { get } from "svelte/store";

const TIMER_DURATION = 6000;

function hasActions(schema, myWind) {
  if (!myWind) return false; // a spectator has no hand to act with
  if (!schema.discarded && schema.discarded !== 0) return false;
  if (schema.previousTurn === myWind) return false;
  // Tiles this client isn't allowed to see are null, so every read here has to
  // tolerate that. A throw would escape the handler's `for(;;)` loop and kill
  // this client's message processing for good -- indistinguishable from a freeze.
  const discard = schema.tiles[schema.discarded];
  if (!discard) return false;
  const isWild = (t) => t && schema.wildcard && eq(t, schema.wildcard);
  if (isWild(discard)) return false;
  const hand = schema[myWind].up;
  const handTiles = hand.map(t => schema.tiles[t]).filter(Boolean);
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
  // Only a win the table can actually offer counts. A win that needs the discard
  // ponged or chowed is already covered by the two checks above, so what is left
  // to look for is the one taken by pairing it -- and that is the eye-constrained
  // question.
  //
  // Asking the unconstrained one instead reported claims that were never on
  // offer: a hand that wins by putting the discard in a triplet alongside a
  // wildcard, say, which nothing above can meld. On someone else's turn that
  // only raised 想想/过 for an impossible claim, but on your own turn this is
  // what suppresses the automatic vote -- so the table sat waiting on a player
  // who had no button to press.
  try {
    if (Schema.winningHand(schema, playerObj, schema.discarded)) return true;
  } catch (e) {}
  return false;
}

export default async function handler(
  schema,
  { socket, store, timer, selection, selectionSets, currentVotes, absent },
) {
  store.set(new Schema(schema));
  for (;;) {
    const message = await socket.recv();

    const schema = new Schema(get(store));
    switch (message.subject) {
      case "addPlayer": {
        const { position, name, host } = message.body;
        schema[position] = player(name);
        if (host !== undefined) schema.host = host;
        store.set(schema);
        break;
      }
      case "removePlayer": {
        const { position, host } = message.body;
        delete schema[position];
        // The host may have just left, handing the start button to someone else.
        schema.host = host;
        store.set(schema);
        break;
      }
      case "hostChanged": {
        schema.host = message.body.host;
        store.set(schema);
        break;
      }
      case "playerDisconnected": {
        absent.update((names) => new Set(names).add(message.body.name));
        break;
      }
      case "playerConnected": {
        absent.update((names) => {
          const next = new Set(names);
          next.delete(message.body.name);
          return next;
        });
        break;
      }
      case "playerReady": {
        // Someone asked for another game. Keyed by name rather than seat, since
        // seats rotate between games and a client still on the scoreboard is
        // holding the previous game's layout.
        const seat = schema.seatOf(message.body.name);
        if (seat && schema[seat]) {
          schema[seat].ready = true;
          store.set(schema);
        }
        break;
      }
      case "start": {
        store.set(new Schema(message.body));
        break;
      }
      case "discard": {
        window.clearTimeout((get(timer) || {}).handle);
        timer.set(null);
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
        const myWind = schema.seatOf(socket.name);
        if (myWind && position !== myWind) {
          // Fallback vote if I never act: draw on my own turn, otherwise ignore.
          // This must stay a real vote (never a bare "ignore" for the turn player) since
          // `Draw` is the one vote the server always knows how to resolve.
          const fallback = () => {
            if (get(currentVotes)[myWind]) return;
            const action = schema.turn === myWind ? "draw" : "ignore";
            socket.send(action).catch(() => {});
          };
          // Away means away. Every branch below is about giving a player time to
          // decide, and the one for your own turn hands the table over to you
          // and waits indefinitely -- which is the last thing to do for someone
          // who has said they are not here. Answer at once and let the server
          // play the seat.
          if (get(absent).has(socket.name)) {
            fallback();
            break;
          }

          const iHaveClaim = hasActions(schema, myWind);
          if (schema.turn === myWind && iHaveClaim) {
            // My turn and a real choice of my own (chow/pong/win): no auto-vote,
            // no clock. I act through the table -- click the wall to draw, or the
            // discard to claim it.
          } else if (schema.turn === myWind) {
            // My turn but nothing to weigh, so vote Draw straight away even when
            // someone else holds a claim. It pre-empts nobody: the round still
            // waits for every seat, and Pong/Kong/Win outrank Draw at resolution.
            // Waiting on `hasClaims` here just stalled the round -- the pong could
            // not complete until I manually clicked the wall.
            fallback();
          } else if (iHaveClaim) {
            // My own claim. `timer.set` is what makes 想想/过 appear, so this is
            // the one case that gets a visible, pausable countdown.
            timer.set({
              start: Date.now(),
              paused: false,
              duration: TIMER_DURATION,
              handle: window.setTimeout(fallback, TIMER_DURATION),
            });
          } else if (hasClaims) {
            // Someone else may claim, but I have nothing to decide. Delay my
            // auto-vote so their claim isn't cut off -- deliberately a bare
            // setTimeout rather than `timer.set`, so no buttons appear on a seat
            // with no decision to make.
            window.setTimeout(fallback, TIMER_DURATION);
          } else {
            // Nobody has any claim on this discard -- keep things moving.
            fallback();
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
        const { position, eyes, reveal, kong, scores, washedOut, finalDraw } = message.body;
        schema.turn = position;
        schema.tiles = reveal;
        schema.completed = true;
        // 黄庄 has no winning hand to lay out, and 海底捞 adds a bonus line --
        // the scoreboard needs to know which ending this was.
        schema.washedOut = !!washedOut;
        schema.finalDraw = !!finalDraw;
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
