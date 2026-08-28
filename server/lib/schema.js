import Message from "../socket/message.js";

export const WINDS = ["Ton", "Shaa", "Pei", "Nan"];
const DRAGONS = ["Chun", "Hatsu", "Haku"];
const SUITS = ["Pin", "Sou", "Man"];

const NEXT_WIND = { Ton: "Nan", Nan: "Shaa", Shaa: "Pei", Pei: "Ton" };
const PREV_WIND = { Nan: "Ton", Shaa: "Nan", Pei: "Shaa", Ton: "Pei" };

const TURN_ORDER = ["Ton", "Nan", "Shaa", "Pei"];

// The dealer is the first *occupied* seat in turn order. It used to be safe to
// assume that was always Ton, because seats were filled sequentially from Ton;
// now that players pick their own seat, Ton may be empty.
// Exported because the scoreboard has to reach the same answer: it recomputes
// the hand's breakdown for display, and when it decided the dealer by the Ton
// chair instead it showed an undoubled base beside a running total that had been
// doubled -- for every table where nobody happened to sit at 东.
// A seat reserved mid-hand is skipped. It holds no tiles, takes no turn and is
// scored by nobody, so it cannot be the dealer of a hand it is not in -- and
// since the search runs in turn order, a spectator taking the empty 东 chair
// would otherwise become dealer of a game already under way. The damage from
// that is not subtle: 黄庄 hands the default win to the newcomer and charges
// every real player two for it, and the dealer's own doubling goes to a seat
// that never appears in the payment loop, so it vanishes.
export function dealerSeat(schema) {
  return TURN_ORDER.find(
    (position) => schema[position] && !schema[position].waiting,
  );
}

// The tail of the wall nobody draws from in normal play -- it is what a kong
// replaces from. Before it, every seated player gets one last draw: the 海底
// round. At a full table that is the four tiles sitting at positions 11 to 14
// counting back from the end, exactly as the rule describes; at a shorter table
// it is one apiece, so the round is always a single lap.
export const DEAD_WALL = 10;

// How many ordinary draws before the last lap the table starts showing which
// tiles it will be made of, so the end of the hand is visible coming. At a full
// table the first tile of the 海底 round is the 14th counting back from the end
// of the wall, so twelve draws of warning puts the mark on at the 26th.
export const LAST_LAP_NOTICE = 12;

// 黄庄: the wall ran down with nobody out. The dealer takes a default win worth
// this much from every other seat.
const WASH_OUT_POINTS = 2;

const HONOR_CYCLE = ["Ton", "Nan", "Shaa", "Pei", "Chun", "Hatsu", "Haku"];
const NEXT_HONOR = Object.fromEntries(HONOR_CYCLE.map((h, i) => [h, HONOR_CYCLE[(i + 1) % HONOR_CYCLE.length]]));
const HONOR_SUIT = { Ton: "wind", Nan: "wind", Shaa: "wind", Pei: "wind", Chun: "dragon", Hatsu: "dragon", Haku: "dragon" };

function nextTileType(tile) {
  if (typeof tile.value === "number") {
    return { suit: tile.suit, value: tile.value === 9 ? 1 : tile.value + 1 };
  }
  const nextValue = NEXT_HONOR[tile.value];
  return { suit: HONOR_SUIT[nextValue], value: nextValue };
}

export function player(name) {
  return { name, up: [], down: [], discarded: [], ready: false, exposedWildcards: [], waiting: false };
}

function tile(suit, value) {
  return { suit, value };
}

function* four(tile) {
  for (let i = 0; i < 4; ++i) {
    yield { ...tile };
  }
}

function* suit(suit) {
  for (let i = 1; i <= 9; ++i) {
    yield* four(tile(suit, i));
  }
}

function* winds(suit) {
  for (const wind of WINDS) {
    yield* four(tile("wind", wind));
  }
}

function* dragons(suit) {
  for (const dragon of DRAGONS) {
    yield* four(tile("dragon", dragon));
  }
}

function* tiles() {
  for (const shape of SUITS) {
    yield* suit(shape);
  }
  yield* winds();
  yield* dragons();
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; --i) {
    const j = Math.floor(Math.random() * i);
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

function* wall(low, high) {
  while (low < high) {
    yield [low++, low++];
  }
}

function* walls(length) {
  const size = length / 4;
  for (let start = 0; start < length; start += size) {
    yield [...wall(start, start + size)];
  }
}

const sum = (arr) => arr.reduce((a, b) => a + b);
export const eq = (a, b) => a.suit === b.suit && a.value === b.value;

function melds(a, b, c) {
  if (eq(a, b) && eq(b, c)) return true;
  if (a.suit !== b.suit || b.suit !== c.suit || typeof a.value !== "number")
    return false;
  const values = [a.value, b.value, c.value].sort();
  return values[0] === values[1] - 1 && values[1] === values[2] - 1;
}

function meldsWithWild(a, b, c, isWild) {
  const wilds = [a, b, c].filter(isWild).length;
  const normals = [a, b, c].filter((t) => !isWild(t));
  if (wilds === 3 || wilds === 2) return true;
  if (wilds === 1) {
    const [x, y] = normals;
    if (eq(x, y)) return true;
    if (x.suit === y.suit && typeof x.value === "number") {
      const diff = Math.abs(x.value - y.value);
      if (diff === 1 || diff === 2) return true;
    }
    return false;
  }
  return melds(a, b, c);
}

// Can these tiles be split into threes, every one of them a run or a triplet?
// Lifted out of `winningHand` so `eyePartner` can ask the same question -- one
// answers "does this win", the other "which tile made it win", and they must not
// drift apart.
function allMeld(tiles, isWild) {
  if (tiles.length === 0) return true;
  for (let i = 0; i < tiles.length - 2; ++i) {
    for (let j = i + 1; j < tiles.length - 1; ++j) {
      for (let k = j + 1; k < tiles.length; ++k) {
        if (meldsWithWild(tiles[i], tiles[j], tiles[k], isWild)) {
          const rest = [...tiles];
          rest.splice(k, 1);
          rest.splice(j, 1);
          rest.splice(i, 1);
          if (allMeld(rest, isWild)) return true;
        }
      }
    }
  }
  return false;
}

function allPairs([...tiles], wildcard) {
  const isWild = (t) => wildcard && eq(t, wildcard);
  let wilds = tiles.filter(isWild).length;
  const normals = tiles.filter((t) => !isWild(t));
  while (normals.length) {
    const tile = normals.pop();
    const index = normals.findIndex((other) => eq(tile, other));
    if (index === -1) {
      if (wilds > 0) {
        wilds--;
      } else {
        return false;
      }
    } else {
      normals.splice(index, 1);
    }
  }
  return wilds % 2 === 0;
}


export default class Schema {
  static concealed(basis, player) {
    const schema = new Schema(basis);
    if (!schema.completed) {
      const down = WINDS.map((position) => schema[position])
        .filter((player) => !!player)
        .map((player) => [...player.discarded, ...[].concat(...player.down), ...(player.exposedWildcards || [])]);
      // `player` may be a spectator with no seat -- reveal nothing of their own
      // (there is no "own hand" to show) rather than treating that as an error.
      const position = schema.seatOf(player);
      const own = position ? schema[position].up : [];
      const revealed = [...own, ...[].concat(...down)];
      if (schema.indicator !== undefined) {
        revealed.push(schema.indicator);
      }

      schema.tiles = schema.tiles.map((tile, i) =>
        revealed.includes(i) ? tile : null,
      );
    }
    return schema;
  }

  static nextGame(previous, initial) {
    const basis = {
      name: previous.name,
      wind: previous.wind,
      scores: previous.scores || {},
      // Seats rotate between games, but whoever runs the table stays the host.
      host: previous.host,
    };
    // Dealer keeps the deal when they win -- compare against the actual dealer
    // seat, which is not necessarily Ton now that seats are chosen freely.
    if (previous.completed && previous.turn === dealerSeat(previous)) {
      for (const position of WINDS) {
        if (previous[position]) {
          basis[position] = player(previous[position].name);
        }
      }
    } else {
      for (const position of WINDS) {
        if (previous[position]) {
          let newPosition = position;
          do {
            newPosition = PREV_WIND[newPosition];
          } while (!previous[newPosition]);
          basis[newPosition] = player(previous[position].name);
        }
      }
      // After each position has been played by a player, change the prevailing
      // wind and continue
      const nextDealer = dealerSeat(basis);
      const firstDealer = dealerSeat(initial);
      if (
        nextDealer && firstDealer &&
        basis[nextDealer].name === initial[firstDealer].name
      ) {
        // Technically if we have reached Ton again, then the game should be done..?
        // I don't think that really matters to us though.
        basis.wind = NEXT_WIND[basis.wind];
      }
    }
    return new Schema(basis);
  }

  static winningHand(schema, player, eye = null) {
    const isWild = (t) => schema.wildcard && eq(t, schema.wildcard);

    const hand = player.up;

    if (hand.length % 3 !== 2) return false;

    const tiles = hand.map((tile) => schema.tiles[tile]);

    const downTiles = player.down.flat()
      .filter((t) => typeof t === "number")
      .map((t) => schema.tiles[t]);
    const allTiles = [...tiles, ...downTiles];

    function allSameKind() {
      const nonWild = allTiles.filter((t) => !isWild(t));
      if (nonWild.length === 0) return true;
      const suit = nonWild[0].suit;
      return nonWild.every((t) => t.suit === suit);
    }

    const nonWildAll = allTiles.filter((t) => !isWild(t));
    if (nonWildAll.every((t) => t.suit === "wind")) return true;

    if (nonWildAll.every((t) => typeof t.value === "number" && [2, 5, 8].includes(t.value))) return true;

    function pongpong() {
      const downValid = player.down.every((meld) => {
        const meldTiles = meld.filter((t) => typeof t === "number").map((t) => schema.tiles[t]);
        return meldTiles.length >= 3 && meldTiles.every((t) => eq(t, meldTiles[0]));
      });
      if (!downValid) return false;
      const nonWild = tiles.filter((t) => !isWild(t));
      const wilds = tiles.length - nonWild.length;

      for (let i = 0; i < nonWild.length; i++) {
        if (nonWild.slice(0, i).some((t) => eq(t, nonWild[i]))) continue;
        const cnt = nonWild.filter((t) => eq(t, nonWild[i])).length;
        if (cnt >= 2) {
          const rest = [];
          let pairRemoved = 0;
          for (const t of nonWild) {
            if (eq(t, nonWild[i]) && pairRemoved < 2) { pairRemoved++; continue; }
            rest.push(t);
          }
          let triplets = [...rest];
          let w = wilds;
          let valid = true;
          while (triplets.length > 0) {
            const f = triplets[0];
            const c = triplets.filter((t) => eq(t, f)).length;
            if (c >= 3) {
              let r = 0;
              triplets = triplets.filter((t) => !(eq(t, f) && ++r <= 3));
            } else if (c + w >= 3) {
              w -= (3 - c);
              triplets = triplets.filter((t) => !eq(t, f));
            } else { valid = false; break; }
          }
          if (valid && w % 3 === 0) return true;
        }
      }
      // pair with wildcard
      if (wilds >= 1 && nonWild.length % 3 === 0) {
        let triplets = [...nonWild];
        let w = wilds - 1;
        let valid = true;
        while (triplets.length > 0) {
          const f = triplets[0];
          const c = triplets.filter((t) => eq(t, f)).length;
          if (c >= 3) {
            let r = 0;
            triplets = triplets.filter((t) => !(eq(t, f) && ++r <= 3));
          } else if (c + w >= 3) {
            w -= (3 - c);
            triplets = triplets.filter((t) => !eq(t, f));
          } else { valid = false; break; }
        }
        if (valid && w % 3 === 0) return true;
      }
      return false;
    }

    if (pongpong()) return true;

    if (hand.length === 14) {
      if (allPairs(tiles, schema.wildcard)) {
        return true;
      }
    }

    // Two or more wildcards in hand, and the hand has to earn them: declare them,
    // be one suit throughout, or owe nobody a tile. 全风, 全将, 碰碰胡 and 七对 are
    // already gone above -- exempt by shape, discard or no discard.
    //
    // 门清 is not exempt that way, because taking a tile off the table is exactly
    // what it means not to be 门清. An empty `down` was the whole test, and that
    // holds for a meld but not for the pair: a win claimed on the discard is
    // checked before `eyes()` moves that pair into `down`, so a hand sitting on
    // two wildcards read as concealed at the one moment it was reaching for
    // someone else's tile. `eye` is set precisely then. The scoring already drew
    // this line -- its own 门清 is `down.length === 0 && isSelfDraw`.
    //
    // Counted by wildcards *held*, not wildcards leaned on: a hand can hold three
    // 南 as a plain triplet and still not claim a pair off the table.
    const claimingDiscard = eye !== null && eye !== undefined;
    const wildcardCount = tiles.filter(isWild).length;
    const hasExposedWildcards = (player.exposedWildcards || []).length > 0;
    const isAllClear = player.down.length === 0 && !claimingDiscard;
    if (wildcardCount >= 2 && !hasExposedWildcards && !isAllClear && !allSameKind()) {
      return false;
    }

    function validEye(tile) {
      if (isWild(tile)) return true;
      if (allSameKind()) return typeof tile.value === "number";
      return typeof tile.value === "number" && [2, 5, 8].includes(tile.value);
    }

    // `eye` is a tile index, and index 0 is a perfectly good tile -- a plain
    // truthiness check silently dropped the constraint whenever the claimed tile
    // happened to be the first in the deck, accepting hands that do not use it
    // as the pair.
    if (eye !== null && eye !== undefined) {
      if (!validEye(schema.tiles[eye])) return false;
      // The eye is the claimed tile plus one partner out of the hand: another
      // copy of it, or a wildcard standing in for one.
      //
      // This used to collect the tiles that merely *matched* and drop the first
      // two of them, which is not the same thing: with a spare copy and a
      // wildcard both in hand it removed those two and left the claimed tile
      // itself to be melded. A hand that wins outright by pairing the claimed
      // tile was refused on that alone -- and, since the unconstrained check
      // still saw the win, the table paused for a claim that could not be made.
      return Schema.eyePartner(schema, player, eye) !== undefined;
    } else {
      for (let i = 0; i < tiles.length; i++) {
        if (!validEye(tiles[i])) continue;
        for (let j = i + 1; j < tiles.length; j++) {
          if (!eq(tiles[i], tiles[j]) && !isWild(tiles[i]) && !isWild(tiles[j])) continue;
          if (isWild(tiles[i]) && !isWild(tiles[j]) && !validEye(tiles[j])) continue;
          const remaining = [...tiles];
          remaining.splice(j, 1);
          remaining.splice(i, 1);
          if (allMeld(remaining, isWild)) return true;
        }
      }
      return false;
    }
  }

  // Which tile in `player`'s hand pairs with the claimed tile `eye` to leave a
  // hand that melds? Returns that tile, or undefined when no arrangement singles
  // one out -- a 七对 win, say, where the pair is simply the seventh pair and the
  // rest never melds into threes at all.
  //
  // `winningHand` only answers yes or no; `eyes()` has to move a specific tile
  // into the meld, so it asks here instead of assuming.
  //
  // Real copies are tried before wildcards. A wildcard is at least as flexible
  // as the tile it stands in for, so whenever pairing with one wins, pairing
  // with a real copy wins too -- which leaves the wildcard where it is more
  // interesting to look at, inside a meld.
  static eyePartner(schema, player, eye) {
    const isWild = (tile) => schema.wildcard && eq(tile, schema.wildcard);
    const eyeTile = schema.tiles[eye];
    const rest = player.up.filter((tile) => tile !== eye);
    const matches = rest.filter((tile) => eq(eyeTile, schema.tiles[tile]));
    const wildcards = rest.filter(
      (tile) => !eq(eyeTile, schema.tiles[tile]) && isWild(schema.tiles[tile]),
    );
    for (const candidate of [...matches, ...wildcards]) {
      const remaining = rest
        .filter((tile) => tile !== candidate)
        .map((tile) => schema.tiles[tile]);
      if (allMeld(remaining, isWild)) return candidate;
    }
    return undefined;
  }

  constructor(basis = {}) {
    this.name = basis.name;

    for (const position of WINDS) {
      this[position] = basis[position];
    }

    this.wind = basis.wind || "Ton";
    this.turn = basis.turn || "Ton";
    this.previousTurn = basis.previousTurn || "Ton";
    this.started = basis.started || false;
    this.completed = basis.completed || false;
    this.roll = basis.roll;
    this.drawn = basis.drawn;
    this.source = basis.source;
    this.discarded = basis.discarded;
    // Won on a tile from the 海底 round, and ended with nobody out. Both ride
    // along so a reloading client and the scoreboard can tell what happened.
    this.finalDraw = basis.finalDraw || false;
    this.washedOut = basis.washedOut || false;
    // How the finished hand was scored, itemised. Rides along so a client that
    // reconnects to a completed hand -- or reloads one from the state file --
    // still has the breakdown to show.
    this.breakdown = basis.breakdown;

    this.tiles = basis.tiles || shuffle([...tiles()]);
    this.walls = basis.walls || [...walls(this.tiles.length)];
    this.indicator = basis.indicator;
    this.wildcard = basis.wildcard;
    this.scores = basis.scores || {};
    // Whoever sat down first. They alone get the start button, so the table
    // doesn't need every player to ready up individually.
    this.host = basis.host;
  }

  hasSpace() {
    return WINDS.some((position) => !this[position]);
  }

  hasPlayer(name) {
    return WINDS.some(
      (position) => this[position] && this[position].name === name,
    );
  }

  // Like `playerWind`, but returns `undefined` instead of throwing when `name`
  // isn't seated -- for call sites that need to tolerate an unseated viewer
  // (spectators) rather than treat it as an invalid/forbidden action.
  seatOf(name) {
    return WINDS.find(
      (position) => this[position] && this[position].name === name,
    );
  }

  playerWind(name) {
    const position = this.seatOf(name);
    if (!position) {
      // The room is `name` on the schema; there has never been a `game` field,
      // so this read `... in game undefined` every time it fired.
      throw new Error(`No player ${name} in game ${this.name}`);
    }
    return position;
  }

  start() {
    this.assertStarted(false);
    this.started = true;
    this.roll = [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
    ];

    let [wall, stack] = this.nextDraw();
    const winds = TURN_ORDER.filter((position) => this[position]);
    // The 14th tile goes to winds[0], so the turn must point there too. Without
    // this, `turn` keeps its "Ton" default -- and if nobody took the Ton seat it
    // names an empty seat, so no client ever has `myTurn` and the game freezes
    // before the first discard.
    this.turn = winds[0];
    this.previousTurn = winds[0];
    for (let i = 0; i < 3; ++i) {
      for (const position of winds) {
        for (let j = 0; j < 2; ++j) {
          if (stack >= this.walls[wall].length) {
            stack %= this.walls[wall].length;
            wall = (wall + 1) % 4;
          }

          const tiles = this.walls[wall][stack].splice(0, 2);
          this[position].up.push(...tiles);
          stack += 1;
        }
      }
    }

    for (const position of winds) {
      if (stack >= this.walls[wall].length) {
        stack %= this.walls[wall].length;
        wall = (wall + 1) % 4;
      }

      const tile = this.walls[wall][stack].pop();
      this[position].up.push(tile);
      if (this.walls[wall][stack].length === 0) {
        stack += 1;
      }
    }

    // Every other wall access above wraps when `stack` runs off the end; this one
    // did not, so whenever dealing happened to finish on the last stack of a wall
    // -- which depends on the dice roll -- the deal crashed on `undefined.pop()`.
    // Step to the next tile that actually exists before taking the 14th.
    for (let guard = 0; guard <= this.walls.length * this.walls[wall].length; ++guard) {
      if (stack >= this.walls[wall].length) {
        stack %= this.walls[wall].length;
        wall = (wall + 1) % 4;
      }
      if (this.walls[wall][stack] && this.walls[wall][stack].length > 0) break;
      stack += 1;
    }

    const draw = this.walls[wall][stack].pop();
    this.drawn = draw;
    this.source = "front";
    this[winds[0]].up.push(draw);

    const [indWall, indStack] = this.reverseDraw();
    this.indicator = this.walls[indWall][indStack].pop();
    this.wildcard = nextTileType(this.tiles[this.indicator]);
  }

  addPlayer(name, position) {
    if (!WINDS.includes(position)) {
      throw new Error(`${position} is not a valid seat.`);
    }
    if (this[position]) {
      throw new Error(`That seat is already taken.`);
    }
    if (this.hasPlayer(name)) {
      throw new Error(`${name} already has a seat.`);
    }
    this[position] = player(name);
    // Sitting down mid-hand reserves the chair rather than joining the hand: the
    // deal has happened and there are no tiles to give out. They are visible at
    // the table straight away, and every turn, claim and scoring path skips a
    // `waiting` seat, so the hand in progress plays exactly as it would have.
    // `nextGame()` rebuilds each seat with `player(name)`, which clears the flag
    // -- that is what deals them in for the following hand.
    //
    // Refusing the seat outright was the alternative, and used to be what
    // happened; it meant a spectator had to be watching at the moment a hand
    // ended to get a chair at all.
    this[position].waiting = this.started && !this.completed;
    if (!this.host) {
      this.host = name;
    }
    // `host` rides along so every client learns who owns the start button, and
    // `waiting` because a client rebuilds the seat from this message alone. Left
    // out, every screen in the room counted a mid-hand arrival as playing: the
    // 海底 affordance is sized off `activePlayers()`, so it marked the wrong
    // tiles and warned a draw early for everybody, and the newcomer's own client
    // thought the hand was theirs to act in.
    return new Message("addPlayer", {
      position,
      name,
      host: this.host,
      waiting: this[position].waiting,
    });
  }

  removePlayer(name) {
    const position = this.playerWind(name);
    // A hand under way cannot give up a seat that is holding tiles. A seat only
    // reserved for the next hand is not part of it, though, so letting that one
    // go costs the table nothing -- and without the exception a spectator who
    // sat down and then closed the tab threw on the way out, from the middle of
    // the disconnect path.
    if (!this[position].waiting) {
      this.assertStarted(false);
    }
    delete this[position];
    if (this.host === name) {
      // Hand the start button to whoever is still here, or to the next arrival.
      const heir = WINDS.map((wind) => this[wind]).find((player) => !!player);
      this.host = heir ? heir.name : undefined;
    }
    return new Message("removePlayer", { position, host: this.host });
  }

  seatedPlayers() {
    return WINDS.map((position) => this[position]).filter((player) => !!player);
  }

  activePlayers() {
    return this.seatedPlayers().filter((player) => !player.waiting);
  }

  assertStarted(started) {
    if (this.started !== started) {
      throw new Error(
        `The game ${this.name} has ${started ? "not" : "already"} started.`,
      );
    }
  }

  // How many tiles are still sitting in the wall.
  tilesRemaining() {
    return this.walls.reduce(
      (total, wall) => total + wall.reduce((n, stack) => n + stack.length, 0),
      0,
    );
  }

  // Is the wall down to its last lap? Everything left beyond the dead wall is
  // one final draw per seated player, taken without discarding.
  finalRound() {
    return this.tilesRemaining() <= DEAD_WALL + this.activePlayers().length;
  }

  // A kong replaces from the back of the wall, and once the hand is down to its
  // last lap that is the only part left standing -- the 海底 round is counted out
  // of what remains in front of it, so spending a tile from behind moves the end
  // of the hand while it is being reached. No kong from here on: the last lap is
  // dealt as it stands.
  assertKongAllowed() {
    if (this.finalRound()) {
      throw new Error("No kong on the last lap.");
    }
  }

  // Everything still in the wall, in the order it will come off it: forward from
  // the break, and top tile first within each stack. Kongs eat the far end, so
  // the tail of this is the dead wall.
  drawOrder() {
    const order = [];
    if (this.roll === undefined) return order;
    let wall = 3 - ((sum(this.roll) + 2) % 4);
    let stack = sum(this.roll) + 1;
    const stacks = this.walls.reduce((n, w) => n + w.length, 0);
    for (let n = 0; n < stacks; n++) {
      if (stack >= this.walls[wall].length) {
        stack %= this.walls[wall].length;
        wall = (wall + 1) % 4;
      }
      const tiles = this.walls[wall][stack];
      for (let i = tiles.length - 1; i >= 0; i--) order.push(tiles[i]);
      stack += 1;
    }
    return order;
  }

  // Which tiles the 海底 round will be drawn from, and how many ordinary draws
  // are still to come before it starts.
  lastLap() {
    const order = this.drawOrder();
    const end = Math.max(0, order.length - DEAD_WALL);
    const start = Math.max(0, end - this.activePlayers().length);
    return { tiles: order.slice(start, end), drawsAway: start };
  }

  // 黄庄. Nobody got out, so the dealer takes a default win and every other seat
  // pays them a flat WASH_OUT_POINTS -- no hand bonuses, no doublings, no cap.
  // Leaving `turn` on the dealer is also what keeps the deal with them, since
  // `nextGame` rotates the seats unless the dealer took the round.
  washOut() {
    const position = dealerSeat(this);
    this.completed = true;
    this.washedOut = true;
    this.turn = position;
    delete this.discarded;

    const winner = this[position].name;
    if (!this.scores[winner]) this.scores[winner] = 0;
    let total = 0;
    for (const wind of WINDS) {
      if (!this[wind] || this[wind].waiting || wind === position) continue;
      const loser = this[wind].name;
      if (!this.scores[loser]) this.scores[loser] = 0;
      this.scores[loser] -= WASH_OUT_POINTS;
      total += WASH_OUT_POINTS;
    }
    this.scores[winner] += total;

    // 黄庄 has no hand to lay out, so there is nothing to itemise. The scoreboard
    // prints its own flat two-a-head summary for this ending; the empty shape is
    // here so `breakdown` is always present once a hand has finished.
    this.breakdown = { lines: [], losers: [], winnerTotal: total, dealer: winner };

    return new Message("win", {
      position,
      reveal: this.tiles,
      washedOut: true,
      kong: false,
      allClear: false,
      allFromOthers: false,
      scores: this.scores,
      breakdown: this.breakdown,
    });
  }

  draw(position) {
    if (position !== this.turn || this.drawn !== undefined) {
      // `name` is not a variable here -- this used to throw ReferenceError and
      // bury whatever actually went wrong.
      throw new Error(`It is not ${position}'s turn to draw.`);
    }
    const [wall, stack] = this.nextDraw();
    const tile = this.walls[wall][stack].pop();
    this.drawn = tile;
    this.source = "front";
    delete this.discarded;
    this[position].up.push(tile);
    return [new Message("draw", { tile, wall, stack }), this.tiles[tile]];
  }

  exposeWildcard(player) {
    const position = this.playerWind(player);
    if (position !== this.turn) {
      throw new Error("It is not your turn.");
    }
    if (this.drawn === undefined) {
      throw new Error("You must draw first.");
    }
    if (!this.wildcard || !eq(this.tiles[this.drawn], this.wildcard)) {
      throw new Error("The drawn tile is not a wildcard.");
    }
    if (this[position].down.length === 0) {
      throw new Error("You must have exposed melds to expose a wildcard.");
    }
    const wildcardCount = this[position].up
      .filter((t) => eq(this.tiles[t], this.wildcard)).length;
    if (wildcardCount < 2) {
      throw new Error("You must have at least 2 wildcards to expose one.");
    }
    if (!this[position].exposedWildcards) this[position].exposedWildcards = [];
    this[position].exposedWildcards.push(this.drawn);
    return new Message("exposeWildcard", { position, tile: this.drawn, reveal: this.tiles[this.drawn] });
  }

  pong(position) {
    if (position === this.previousTurn) {
      throw new Error("You may not pick up your own discard.");
    }
    if (this.wildcard && eq(this.tiles[this.discarded], this.wildcard)) {
      throw new Error("Wildcard tiles cannot be used in pong.");
    }
    const hand = this[position].up;
    const discard = this.tiles[this.discarded];

    const matching = hand.filter((tile) => eq(this.tiles[tile], discard));
    if (matching.length < 2) {
      throw new Error("You must have two matching tiles to pong.");
    }
    hand.splice(hand.indexOf(matching[0]), 1);
    hand.splice(hand.indexOf(matching[1]), 1);
    const tiles = [matching[0], matching[1], this.discarded];
    this[position].down.push(tiles);
    this[this.previousTurn].discarded.pop();
    this.turn = position;
    this.drawn = this.discarded;
    this.source = "discard";
    delete this.discarded;
    const reveal = matching
      .slice(0, 2)
      .map((index) => [index, this.tiles[index]]);
    return new Message("take", { position, tiles, reveal });
  }

  exposedKong(position) {
    this.assertKongAllowed();
    if (position === this.previousTurn) {
      throw new Error("You may not pick up your own discard.");
    }
    if (this.wildcard && eq(this.tiles[this.discarded], this.wildcard)) {
      throw new Error("Wildcard tiles cannot be used in kong.");
    }
    const hand = this[position].up;
    const discard = this.tiles[this.discarded];

    const matching = hand.filter((tile) => eq(this.tiles[tile], discard));
    if (matching.length < 3) {
      throw new Error("You must have three matching tiles to kong.");
    }
    hand.splice(hand.indexOf(matching[0]), 1);
    hand.splice(hand.indexOf(matching[1]), 1);
    hand.splice(hand.indexOf(matching[2]), 1);
    const tiles = [
      matching[0],
      matching[1],
      matching[2],
      this.discarded,
      "exposed",
    ];
    this[position].down.push(tiles);
    this[this.previousTurn].discarded.pop();
    this.turn = position;
    const [wall, stack] = this.reverseDraw();
    this.drawn = this.walls[wall][stack].pop();
    this.source = "back";
    this[position].up.push(this.drawn);
    delete this.discarded;
    const reveal = matching.map((index) => [index, this.tiles[index]]);
    return [
      new Message("take", { position, tiles, wall, stack, reveal }),
      [this.drawn, this.tiles[this.drawn]],
    ];
  }

  concealedKong(player, tile) {
    this.assertKongAllowed();
    const position = this.playerWind(player);
    if (position !== this.turn) {
      throw new Error("It is not your turn.");
    }
    const tileInfo = this.tiles[tile];
    if (this.wildcard && eq(tileInfo, this.wildcard)) {
      throw new Error("Wildcard tiles cannot be used in kong.");
    }
    const matching = this[position].up.filter((tile) =>
      eq(this.tiles[tile], tileInfo),
    );
    if (matching.length !== 4) {
      throw new Error("You must have four matching tiles to kong.");
    }
    for (const tile of matching) {
      this[position].up.splice(this[position].up.indexOf(tile), 1);
    }
    const tiles = [...matching, "concealed"];
    this[position].down.push(tiles);
    const [wall, stack] = this.reverseDraw();
    this.drawn = this.walls[wall][stack].pop();
    this.source = "back";
    this[position].up.push(this.drawn);
    const reveal = matching.map((index) => [index, this.tiles[index]]);
    return [
      new Message("kong", { position, tiles, wall, stack, reveal }),
      [this.drawn, this.tiles[this.drawn]],
    ];
  }

  augmentedKong(player, tile) {
    this.assertKongAllowed();
    const position = this.playerWind(player);
    if (position !== this.turn) {
      throw new Error("It is not your turn.");
    }

    const tileInfo = this.tiles[tile];
    if (this.wildcard && eq(tileInfo, this.wildcard)) {
      throw new Error("Wildcard tiles cannot be used in kong.");
    }
    const matching = this[position].down.findIndex((meld) => {
      if (meld.length !== 3) {
        return false;
      }
      return meld
        .map((tile) => this.tiles[tile])
        .every((info) => eq(tileInfo, info));
    });
    if (matching === -1) {
      throw new Error("You do not have a pong to augment.");
    }
    this[position].up.splice(this[position].up.indexOf(tile), 1);
    this[position].down[matching].push(tile, "exposed");

    const [wall, stack] = this.reverseDraw();
    this.drawn = this.walls[wall][stack].pop();
    this.source = "back";
    this[position].up.push(this.drawn);

    const reveal = [[tile, tileInfo]];
    return [
      new Message("kong", {
        position,
        tiles: [tile, "exposed"],
        meld: matching,
        wall,
        stack,
        reveal,
      }),
      [this.drawn, this.tiles[this.drawn]],
    ];
  }

  chow(position, matching) {
    if (position === this.previousTurn) {
      throw new Error("You may not pick up your own discard.");
    }
    if (this.wildcard && eq(this.tiles[this.discarded], this.wildcard)) {
      throw new Error("Wildcard tiles cannot be used in chow.");
    }

    if (matching.length !== 2) {
      throw new Error("You must choose two tiles to chow with.");
    }
    const hand = this[position].up;
    for (const tile of matching) {
      if (!hand.includes(tile)) {
        throw new Error("You do not own these tiles.");
      }
      if (this.wildcard && eq(this.tiles[tile], this.wildcard)) {
        throw new Error("Wildcard tiles cannot be used in chow.");
      }
      hand.splice(hand.indexOf(tile), 1);
    }
    const tiles = [...matching, this.discarded];
    this[position].down.push(tiles);
    this[this.previousTurn].discarded.pop();
    this.turn = position;
    this.drawn = this.discarded;
    this.source = "discard";
    delete this.discarded;
    const reveal = matching.map((index) => [index, this.tiles[index]]);
    return new Message("take", { position, tiles, reveal });
  }

  eyes(position, kong) {
    if (position === this.previousTurn) {
      throw new Error("You may not pick up your own discard.");
    }
    const discard = this.tiles[this.discarded];
    const player = { ...this[position] };
    player.up = [...player.up, this.discarded];
    if (!Schema.winningHand(this, player, this.discarded)) {
      throw new Error("You may not pick up eyes if it does not win the game.");
    }
    const tile = this.discarded;
    // Take the partner the win actually needs, when the melds pick one out.
    let partner = Schema.eyePartner(this, player, this.discarded);
    if (partner === undefined) {
      // Nothing in the melds singles one out -- a 七对 win lands here, where the
      // pair is simply the seventh pair. Any match will do, and a real copy is
      // preferred over spending the wildcard on it.
      partner = this[position].up.find((tile) => eq(this.tiles[tile], discard));
      if (partner === undefined && this.wildcard) {
        partner = this[position].up.find((tile) =>
          eq(this.tiles[tile], this.wildcard),
        );
      }
    }
    if (partner === undefined) {
      throw new Error("You have nothing to pair that tile with.");
    }
    const [leftEye] = this[position].up.splice(
      this[position].up.indexOf(partner),
      1,
    );

    this[this.previousTurn].discarded.pop();
    const eyes = [leftEye, this.discarded];
    this[position].down.push(eyes);
    this.drawn = this.discarded;
    this.source = "discard";
    this.turn = position;
    delete this.discarded;
    this.completed = true;
    if (kong) {
      // stealing someone's kong to win is worth points, so we have to watch for it specifically
      this.source = "kong";
    }
    const allClear = false;
    const allFromOthers = this[position].down.length >= 4;
    this.updateScores(position);
    return new Message("win", { position, eyes, reveal: this.tiles, kong, allClear, allFromOthers, scores: this.scores, breakdown: this.breakdown });
  }

  computeRoundScore(position) {
    const winner = this[position];
    const allTiles = [...winner.up, ...winner.down.flat()]
      .filter((t) => typeof t === "number")
      .map((t) => this.tiles[t]);

    // The dealer (庄家) doubles the base point, but the dealer is the first
    // *occupied* seat in turn order, not necessarily Ton -- seats are chosen
    // freely now, so Ton may be empty. Comparing against a hardcoded "Ton" lost
    // the dealer double for every table where the dealer sat elsewhere.
    const dealer = dealerSeat(this);
    const isDealer = position === dealer;
    const isSelfDraw = this.source === "front" || this.source === "back";
    const isFinalDraw = !!this.finalDraw;
    // 杠上开花: won on the replacement tile drawn after making a kong. Every kong
    // -- concealed, augmented or claimed from a discard -- replaces from the back
    // of the wall and marks the draw "back", and nothing else does, so that is
    // exactly the flower on the kong.
    const isKongBloom = this.source === "back";

    const isPongpong = (() => {
      const isW = (t) => this.wildcard && eq(t, this.wildcard);
      const hasPairInDown = winner.down.some((meld) => {
        const meldTiles = meld.filter((t) => typeof t === "number");
        return meldTiles.length === 2;
      });
      const downValid = winner.down.every((meld) => {
        const meldTiles = meld
          .filter((t) => typeof t === "number")
          .map((t) => this.tiles[t]);
        return (meldTiles.length >= 3 && meldTiles.every((t) => eq(t, meldTiles[0]))) ||
          meldTiles.length === 2;
      });
      if (!downValid) return false;
      const handTiles = winner.up.map((t) => this.tiles[t]);
      const nonWild = handTiles.filter((t) => !isW(t));
      const wilds = handTiles.length - nonWild.length;

      if (hasPairInDown) {
        // pair already in down (eyes win), hand should be all triplets
        let triplets = [...nonWild];
        let w = wilds;
        let valid = true;
        while (triplets.length > 0) {
          const f = triplets[0];
          const c = triplets.filter((t) => eq(t, f)).length;
          if (c >= 3) {
            let r = 0;
            triplets = triplets.filter((t) => !(eq(t, f) && ++r <= 3));
          } else if (c + w >= 3) {
            w -= (3 - c);
            triplets = triplets.filter((t) => !eq(t, f));
          } else { valid = false; break; }
        }
        if (valid && w % 3 === 0) return true;
        // The eyes pair may not be the pongpong pair — recombine and try full check
        const pairMeld = winner.down.find((meld) => {
          const mt = meld.filter((t) => typeof t === "number");
          return mt.length === 2;
        });
        const pairTiles = pairMeld.filter((t) => typeof t === "number").map((t) => this.tiles[t]);
        const combined = [...handTiles, ...pairTiles];
        const combinedNonWild = combined.filter((t) => !isW(t));
        const combinedWilds = combined.length - combinedNonWild.length;
        for (let i = 0; i < combinedNonWild.length; i++) {
          if (combinedNonWild.slice(0, i).some((t) => eq(t, combinedNonWild[i]))) continue;
          const cnt = combinedNonWild.filter((t) => eq(t, combinedNonWild[i])).length;
          if (cnt >= 2) {
            const rest = [];
            let pairRemoved = 0;
            for (const t of combinedNonWild) {
              if (eq(t, combinedNonWild[i]) && pairRemoved < 2) { pairRemoved++; continue; }
              rest.push(t);
            }
            let tr = [...rest];
            let ww = combinedWilds;
            let v = true;
            while (tr.length > 0) {
              const f = tr[0];
              const c = tr.filter((t) => eq(t, f)).length;
              if (c >= 3) {
                let r = 0;
                tr = tr.filter((t) => !(eq(t, f) && ++r <= 3));
              } else if (c + ww >= 3) {
                ww -= (3 - c);
                tr = tr.filter((t) => !eq(t, f));
              } else { v = false; break; }
            }
            if (v && ww % 3 === 0) return true;
          }
        }
        if (combinedWilds >= 1 && combinedNonWild.length % 3 === 0) {
          let tr = [...combinedNonWild];
          let ww = combinedWilds - 1;
          let v = true;
          while (tr.length > 0) {
            const f = tr[0];
            const c = tr.filter((t) => eq(t, f)).length;
            if (c >= 3) {
              let r = 0;
              tr = tr.filter((t) => !(eq(t, f) && ++r <= 3));
            } else if (c + ww >= 3) {
              ww -= (3 - c);
              tr = tr.filter((t) => !eq(t, f));
            } else { v = false; break; }
          }
          if (v && ww % 3 === 0) return true;
        }
        return false;
      }

      for (let i = 0; i < nonWild.length; i++) {
        if (nonWild.slice(0, i).some((t) => eq(t, nonWild[i]))) continue;
        const cnt = nonWild.filter((t) => eq(t, nonWild[i])).length;
        if (cnt >= 2) {
          const rest = [];
          let pairRemoved = 0;
          for (const t of nonWild) {
            if (eq(t, nonWild[i]) && pairRemoved < 2) { pairRemoved++; continue; }
            rest.push(t);
          }
          let triplets = [...rest];
          let w = wilds;
          let valid = true;
          while (triplets.length > 0) {
            const f = triplets[0];
            const c = triplets.filter((t) => eq(t, f)).length;
            if (c >= 3) {
              let r = 0;
              triplets = triplets.filter((t) => !(eq(t, f) && ++r <= 3));
            } else if (c + w >= 3) {
              w -= (3 - c);
              triplets = triplets.filter((t) => !eq(t, f));
            } else { valid = false; break; }
          }
          if (valid && w % 3 === 0) return true;
        }
      }
      // pair with wildcard
      if (wilds >= 1 && nonWild.length % 3 === 0) {
        let triplets = [...nonWild];
        let w = wilds - 1;
        let valid = true;
        while (triplets.length > 0) {
          const f = triplets[0];
          const c = triplets.filter((t) => eq(t, f)).length;
          if (c >= 3) {
            let r = 0;
            triplets = triplets.filter((t) => !(eq(t, f) && ++r <= 3));
          } else if (c + w >= 3) {
            w -= (3 - c);
            triplets = triplets.filter((t) => !eq(t, f));
          } else { valid = false; break; }
        }
        if (valid && w % 3 === 0) return true;
      }
      return false;
    })();

    const isAllClear = winner.down.length === 0 && isSelfDraw;
    const isAllFromOthers = !isSelfDraw && winner.down.length >= 4;
    const isAllPairs = (() => {
      const allIndices = [...winner.up, ...winner.down.flat().filter((t) => typeof t === "number")];
      if (allIndices.length !== 14) return false;
      if (winner.down.length > 1) return false;
      return allPairs(
        allIndices.map((t) => this.tiles[t]),
        this.wildcard,
      );
    })();
    const nonWildTiles = allTiles.filter((t) => !(this.wildcard && eq(t, this.wildcard)));
    const isAllJiang = nonWildTiles.every(
      (t) => typeof t.value === "number" && [2, 5, 8].includes(t.value),
    );
    const isAllWinds = nonWildTiles.every((t) => t.suit === "wind");
    const isAllSameKind = (() => {
      const nonWild = allTiles.filter((t) => !(this.wildcard && eq(t, this.wildcard)));
      if (nonWild.length === 0) return true;
      const suit = nonWild[0].suit;
      return nonWild.every((t) => t.suit === suit);
    })();
    const hasNoWildcard = (() => {
      if (!this.wildcard) return true;
      if (!allTiles.some((t) => eq(t, this.wildcard))) return true;
      // Ask the same hand that was just validated. `eyes()` records the claimed
      // pair as a two-tile group in `down`, which leaves `up` one short of the
      // 3n+2 shape `winningHand` will even look at -- so this re-check answered
      // "no" for every discard-pair win, no matter what the wildcards were
      // doing, and 无癞子 was never awarded on one. Fold that pair back in.
      const pair = winner.down.find((meld) => meld.length === 2);
      const restored = pair
        ? {
            ...winner,
            up: [...winner.up, ...pair],
            down: winner.down.filter((meld) => meld !== pair),
          }
        : winner;
      const noWildSchema = { ...this, wildcard: null };
      return Schema.winningHand(noWildSchema, restored);
    })();
    const kongCount = winner.down.filter((meld) => meld.length >= 5).length;
    const pairsFourOfAKind = (() => {
      if (!isAllPairs) return 0;
      const nonWild = allTiles.filter((t) => !(this.wildcard && eq(t, this.wildcard)));
      const counts = {};
      for (const t of nonWild) {
        const key = t.suit + '|' + t.value;
        counts[key] = (counts[key] || 0) + 1;
      }
      return Object.values(counts).filter((c) => c === 4).length;
    })();

    function calcLoserScore(isLoserDealer, isLoserDiscarder, loserKongCount) {
      let base = 1;
      if (isLoserDealer || isDealer) base *= 2;
      if (isLoserDiscarder) base *= 2;
      let score = base;
      if (isPongpong && !isAllPairs) score += 5;
      if (isAllClear) score += 5;
      if (isAllFromOthers) score += 5;
      if (isAllPairs) score += 10;
      if (isAllJiang) score += 10;
      if (isAllWinds) score += 10;
      if (isAllSameKind) score += 10;
      // 海底捞 -- taken on a tile from the wall's last lap.
      if (isFinalDraw) score += 10;
      // 杠上开花 -- taken on the replacement tile a kong drew.
      if (isKongBloom) score += 10;
      if (hasNoWildcard) score *= 2;
      for (let i = 0; i < kongCount + loserKongCount; i++) score *= 2;
      for (let i = 0; i < pairsFourOfAKind; i++) score *= 2;
      return score;
    }

    // The same flags again, named for the player. Built here rather than on the
    // scoreboard because the scoreboard used to derive all of this a second time
    // from the finished hand, and a second derivation drifts: 无癞子 went missing
    // on claimed wins, 杠上开花 had to be added twice, the dealer's double was
    // looked up by the wrong seat, and a chair reserved mid-hand was billed for a
    // hand it never played. Every one of those showed a breakdown that disagreed
    // with the totals printed underneath it, and every one was found by somebody
    // reading the screen. Say it once, where the scoring is.
    const lines = [{ label: "胡", value: "1" }];
    if (isPongpong && !isAllPairs) lines.push({ label: "碰碰胡", value: "+5" });
    if (isAllClear) lines.push({ label: "门清", value: "+5" });
    if (isAllFromOthers) lines.push({ label: "全求人", value: "+5" });
    if (isAllPairs) lines.push({ label: "七对", value: "+10" });
    if (isAllJiang) lines.push({ label: "全将", value: "+10" });
    if (isAllWinds) lines.push({ label: "全风", value: "+10" });
    if (isAllSameKind) lines.push({ label: "清一色", value: "+10" });
    if (isFinalDraw) lines.push({ label: "海底捞", value: "+10" });
    if (isKongBloom) lines.push({ label: "杠上开花", value: "+10" });
    for (let i = 0; i < kongCount; i++) lines.push({ label: "杠", value: "x2" });
    for (let i = 0; i < pairsFourOfAKind; i++) lines.push({ label: "豪华", value: "x2" });
    if (hasNoWildcard) lines.push({ label: "无癞子", value: "x2" });

    return { isSelfDraw, calcLoserScore, lines };
  }

  // Settles the hand and records how it was settled. The breakdown rides on the
  // schema so it survives a reconnect and the state file, and goes out with the
  // "win" message so the scoreboard can print what was actually scored rather
  // than working it out again.
  updateScores(position) {
    const { isSelfDraw, calcLoserScore, lines } = this.computeRoundScore(position);
    const winnerName = this[position].name;
    if (!this.scores[winnerName]) this.scores[winnerName] = 0;

    const losers = [];
    let winnerTotal = 0;
    for (const wind of WINDS) {
      if (this[wind] && !this[wind].waiting && wind !== position) {
        const isLoserDealer = wind === dealerSeat(this);
        const isLoserDiscarder = isSelfDraw || wind === this.previousTurn;
        const loserKongCount = this[wind].down.filter((meld) => meld.length >= 5).length;
        const rawScore = calcLoserScore(isLoserDealer, isLoserDiscarder, loserKongCount);
        // Nobody pays more than 30, however big the hand. The raw figure travels
        // too, so the scoreboard can show what was earned beside what was paid.
        const payment = Math.min(30, rawScore);
        const name = this[wind].name;
        if (!this.scores[name]) this.scores[name] = 0;
        this.scores[name] -= payment;
        winnerTotal += payment;

        // These sit beside a loser's name, so they are written from that seat's
        // side. 放炮 already was -- it is what the player who fed the tile did.
        // 自摸 was not: that is the winner's doing, and every loser pays the same
        // multiplier for it, so each of them was being labelled with somebody
        // else's achievement. 被自摸 says what happened to them.
        //
        // 庄家 is not here. Dealing is a property of the seat for the whole hand,
        // not something that happened in it, and the panel badges the dealer's
        // row -- naming it again in a list of causes says it twice.
        const reasons = [];
        if (isLoserDiscarder) reasons.push(isSelfDraw ? "被自摸" : "放炮");
        if (loserKongCount > 0) reasons.push(`杠x${loserKongCount}`);
        losers.push({ name, payment, rawScore, reasons });
      }
    }
    this.scores[winnerName] += winnerTotal;

    // Who was dealing, by name, so the panel can mark that row whichever side of
    // the result it fell on -- the dealer may have won or lost.
    const dealer = this[dealerSeat(this)];
    this.breakdown = { lines, losers, winnerTotal, dealer: dealer && dealer.name };
    return this.breakdown;
  }

  win(player, kong = false) {
    const position = this.playerWind(player);
    if (position !== this.turn) {
      throw new Error("You can only win on your own turn.");
    }
    if (!Schema.winningHand(this, this[position])) {
      throw new Error("You do not have a valid winning hand");
    }
    this.completed = true;
    if (kong) {
      this.source = "kong";
    }
    const allClear = this[position].down.length === 0;
    const allFromOthers = false;
    this.updateScores(position);
    return new Message("win", {
      position, reveal: this.tiles, kong, allClear, allFromOthers,
      finalDraw: this.finalDraw,
      scores: this.scores,
      breakdown: this.breakdown,
    });
  }

  // Could `position` win by claiming the currently pending discard (any shape:
  // eyes, chow, or pong)? Used to decide whether a vote round can resolve a win
  // immediately rather than waiting on other seats whose votes could never
  // outrank it.
  couldWin(position) {
    if (this.discarded === undefined) return false;
    const discard = this.tiles[this.discarded];
    if (this.wildcard && eq(discard, this.wildcard)) return false;
    const playerObj = { ...this[position], up: [...this[position].up, this.discarded] };
    return Schema.winningHand(this, playerObj);
  }

  discard(name, tile) {
    const position = this.playerWind(name);
    if (position !== this.turn || this.discarded !== undefined) {
      throw new Error(`It is not ${name}'s turn to discard.`);
    }
    if (this.wildcard && eq(this.tiles[tile], this.wildcard)) {
      throw new Error("Wildcard tiles cannot be discarded.");
    }
    const tileIndex = this[position].up.indexOf(tile);
    if (tileIndex === -1) {
      throw new Error(`Player ${name} does not hold tile ${tile}`);
    }
    this[position].up.splice(tileIndex, 1);
    this[position].discarded.push(tile);
    this.discarded = tile;
    delete this.drawn;
    this.nextTurn();
    const discard = this.tiles[tile];
    const isWild = this.wildcard && eq(discard, this.wildcard);
    let hasPongClaims = false;
    if (!isWild) {
      for (const wind of WINDS) {
        if (!this[wind] || this[wind].waiting || wind === position) continue;
        const hand = this[wind].up.map((t) => this.tiles[t]);
        if (hand.filter((t) => eq(t, discard)).length >= 2) { hasPongClaims = true; break; }
        const playerObj = { ...this[wind], up: [...this[wind].up, tile] };
        // Don't force `tile` as the eye here: that only detects a win where the
        // discard completes the pair, missing a win where it completes a run (chow).
        if (Schema.winningHand(this, playerObj)) { hasPongClaims = true; break; }
      }
    }
    return new Message("discard", { position, tile, reveal: discard, hasClaims: hasPongClaims });
  }

  nextTurn() {
    this.previousTurn = this.turn;
    do {
      this.turn = NEXT_WIND[this.turn];
    } while (!this[this.turn] || this[this.turn].waiting);
  }

  votePriority() {
    return [
      this.turn,
      NEXT_WIND[this.turn],
      NEXT_WIND[NEXT_WIND[this.turn]],
      NEXT_WIND[NEXT_WIND[NEXT_WIND[this.turn]]],
    ];
  }

  nextDraw() {
    if (this.walls.every((wall) => wall.every((stack) => stack.length === 0))) {
      throw new Error("There are no more tiles to be drawn.");
    }
    let wall = 3 - ((sum(this.roll) + 2) % 4);
    let stack = sum(this.roll) + 1;
    for (;;) {
      if (stack >= this.walls[wall].length) {
        stack %= this.walls[wall].length;
        wall = (wall + 1) % 4;
      }
      if (this.walls[wall][stack].length !== 0) {
        break;
      }
      stack += 1;
    }
    return [wall, stack];
  }

  reverseDraw() {
    if (this.walls.every((wall) => wall.every((stack) => stack.length === 0))) {
      throw new Error("There are no more tiles to be drawn.");
    }
    let wall = 3 - ((sum(this.roll) + 2) % 4);
    let stack = sum(this.roll);
    for (;;) {
      if (stack >= this.walls[wall].length) {
        stack %= this.walls[wall].length;
        wall = (wall + 1) % 4;
      }
      if (stack < 0) {
        wall = (wall + 3) % 4;
        stack = this.walls[wall].length - 1;
      }
      if (this.walls[wall][stack].length !== 0) {
        break;
      }
      stack -= 1;
    }
    return [wall, stack];
  }
}
