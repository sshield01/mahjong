import Schema, { player, eq } from "../lib/schema.js";
import { get } from "svelte/store";

const TIMER_DURATION = 8000;
let haClaimsHandle = null;
// The pending auto-ignore for a seat with nothing to decide, held so it can be
// cast the moment another seat acts instead of idling out its full delay.
let haClaimsFallback = null;

// A short beat before the client draws for you on a plain turn, so the tile the
// previous player discarded has a moment to land on the table before your own
// new tile pops into hand. Purely cosmetic: this draw vote pre-empts nobody (the
// round still waits for every seat, and any real claim outranks Draw), so the
// pause only affects how the sequence reads, never who wins the round. Cleared
// on the next "discard"/"draw" so it never fires against a stale position.
const AUTO_DRAW_DELAY = 500;
let autoDrawHandle = null;
// The turn player's held-back draw, kept alongside its handle so the "vote" case
// can cast it the instant another seat acts -- see the note there.
let autoDrawFallback = null;

// Does this seat hold a claim on the tile currently on the table? Exported for
// the tests: this is what arms the claim clock, and getting it wrong is silent --
// a seat with no clock casts its automatic vote and the claim is gone before
// anyone sees a button.
export function hasActions(schema, myWind) {
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
  // The runs this discard could complete. Worked out for every seat, not just
  // the one in turn: taking the tile as a 吃 is the turn player's privilege, but
  // *winning* on it is not, and the server agrees -- `chow` refuses only your own
  // discard, and a Win vote outranks everything else in the round.
  const runPartners = (() => {
    if (typeof discard.value !== 'number') return [];
    const ofSuit = hand.filter(t => {
      const info = schema.tiles[t];
      return info && info.suit === discard.suit && !isWild(info);
    });
    const at = (value) => ofSuit.find(t => schema.tiles[t].value === value);
    const [below2, below1, above1, above2] = [
      at(discard.value - 2), at(discard.value - 1),
      at(discard.value + 1), at(discard.value + 2),
    ];
    return [[below2, below1], [below1, above1], [above1, above2]]
      .filter(pair => pair.every(t => typeof t === 'number'));
  })();

  if (schema.turn === myWind && runPartners.length > 0) return true;

  // A hand that goes out on the run itself. This used to hang off the turn check
  // above, on the reasoning that a chow win was covered by it -- but off-turn
  // that check never runs, so a win completed by a run was seen by nobody. The
  // table offered the 胡 (Tiles.svelte builds those offers for any seat) while
  // the clock never armed: no 想想, no 过, the discard not claimable from the big
  // tile, and this client voting the win away.
  for (const tiles of runPartners) {
    const withRun = { ...schema[myWind] };
    withRun.up = hand.filter(t => !tiles.includes(t));
    withRun.down = [...schema[myWind].down, [...tiles, schema.discarded]];
    try {
      if (Schema.winningHand(schema, withRun)) return true;
    } catch (e) {}
  }

  const playerObj = { ...schema[myWind] };
  playerObj.up = [...hand, schema.discarded];
  // The last shape left: the discard taken as the eye pair. Deliberately the
  // eye-constrained question -- asking the unconstrained one reported claims that
  // were never on offer, such as a hand winning by putting the discard in a
  // triplet beside a wildcard, which nothing can meld. Off-turn that merely
  // raised 想想/过 for an impossible claim; on your own turn it suppressed the
  // automatic vote, and the table sat waiting on a player with no button to press.
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
        const { position, name, host, waiting } = message.body;
        schema[position] = player(name);
        // Someone sitting down mid-hand has reserved the chair, not joined the
        // hand. `player()` starts everyone off active, so without this the seat
        // counts towards `activePlayers()` on every screen and the table is
        // measured against a player who is not in it.
        schema[position].waiting = !!waiting;
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
        window.clearTimeout(haClaimsHandle);
        window.clearTimeout(autoDrawHandle);
        haClaimsHandle = null;
        haClaimsFallback = null;
        autoDrawHandle = null;
        autoDrawFallback = null;
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
        if (myWind && !schema[myWind].waiting && position !== myWind) {
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
            // My turn but nothing to weigh, so vote Draw even when someone else
            // holds a claim. It pre-empts nobody: the round still waits for every
            // seat, and Pong/Kong/Win outrank Draw at resolution. Waiting on
            // `hasClaims` here just stalled the round -- the pong could not
            // complete until I manually clicked the wall.
            //
            // A short beat first, though, so the discard that just landed is
            // readable before the draw pulls the table on -- casting it instantly
            // made the board jump. `fallback` re-checks the vote before sending,
            // so acting manually in the meantime simply pre-empts this.
            //
            // The callback clears the pair on its way through: a fired timeout
            // still leaves a truthy handle behind, and the "vote" case below
            // takes that as a draw still waiting and casts it a second time.
            autoDrawFallback = fallback;
            autoDrawHandle = window.setTimeout(() => {
              autoDrawHandle = null;
              autoDrawFallback = null;
              fallback();
            }, AUTO_DRAW_DELAY);
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
            //
            // The delay is only there to hold the round open until a claimer has
            // had the chance to act. Once any of them actually votes (the "vote"
            // case brings this forward), there is nothing left to wait for, so
            // the pending ignore is kept here to be cast the moment that happens
            // rather than idling out the full duration -- which otherwise made a
            // claim that resolved instantly still sit for the remaining seconds.
            haClaimsFallback = fallback;
            haClaimsHandle = window.setTimeout(fallback, TIMER_DURATION);
          } else {
            // Nobody has any claim on this discard -- keep things moving.
            fallback();
          }
        }
        break;
      }
      case "draw": {
        window.clearTimeout((get(timer) || {}).handle);
        window.clearTimeout(autoDrawHandle);
        autoDrawHandle = null;
        autoDrawFallback = null;
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
        // A seat waiting only to keep the round open (the `hasClaims` branch of
        // "discard") was giving claimers time to act. Someone just did, so there
        // is no longer anything to wait for -- cast the pending ignore now rather
        // than making everyone sit out the rest of the delay. Priority 0 means it
        // can only ever resolve a round every claimer has already answered, so
        // bringing it forward cuts nobody off.
        if (haClaimsFallback) {
          window.clearTimeout(haClaimsHandle);
          const pending = haClaimsFallback;
          haClaimsHandle = null;
          haClaimsFallback = null;
          pending();
        }
        // The turn player's draw is held back purely for pacing (AUTO_DRAW_DELAY),
        // and it pre-empts nobody -- Draw is the lowest priority at resolution. But
        // a round only resolves once *every* seat has voted, and a 碰/杠 is not a
        // win, so it cannot resolve the round on its own: it sits waiting on the
        // turn player's still-pending draw. Somebody just voted, so bring that draw
        // forward now instead of stalling out the delay (or, if the turn player
        // held a claim so no auto-draw was armed, until they manually drew) -- which
        // is what made a pressed 碰/杠 do nothing until the next player drew.
        if (autoDrawHandle) {
          window.clearTimeout(autoDrawHandle);
          const pendingDraw = autoDrawFallback;
          autoDrawHandle = null;
          autoDrawFallback = null;
          if (pendingDraw) pendingDraw();
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
        const { position, eyes, reveal, kong, scores, washedOut, finalDraw, breakdown } = message.body;
        schema.turn = position;
        schema.tiles = reveal;
        schema.completed = true;
        // How the hand was scored, itemised by the same code that did the
        // scoring. The scoreboard prints this rather than deriving it a second
        // time from the finished hand, which is what used to drift.
        schema.breakdown = breakdown;
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
