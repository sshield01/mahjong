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
function dealerSeat(schema) {
  return TURN_ORDER.find((position) => schema[position]);
}

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
  return { name, up: [], down: [], discarded: [], ready: false, exposedWildcards: [] };
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

    function allMeld(tiles) {
      function melds(a, b, c) {
        if (eq(a, b) && eq(b, c)) return true;
        if (
          a.suit !== b.suit ||
          b.suit !== c.suit ||
          typeof a.value !== "number"
        )
          return false;
        const values = [a.value, b.value, c.value].sort();
        return values[0] === values[1] - 1 && values[1] === values[2] - 1;
      }

      function meldsWithWild(a, b, c) {
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

      if (tiles.length === 0) return true;
      for (let i = 0; i < tiles.length - 2; ++i) {
        for (let j = i + 1; j < tiles.length - 1; ++j) {
          for (let k = j + 1; k < tiles.length; ++k) {
            if (meldsWithWild(tiles[i], tiles[j], tiles[k])) {
              const rest = [...tiles];
              rest.splice(k, 1);
              rest.splice(j, 1);
              rest.splice(i, 1);
              if (allMeld(rest)) return true;
            }
          }
        }
      }
      return false;
    }

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

    const wildcardCount = tiles.filter(isWild).length;
    const hasExposedWildcards = (player.exposedWildcards || []).length > 0;
    const isAllClear = player.down.length === 0;
    if (wildcardCount >= 2 && !hasExposedWildcards && !isAllClear && !allSameKind()) {
      return false;
    }

    function validEye(tile) {
      if (isWild(tile)) return true;
      if (allSameKind()) return typeof tile.value === "number";
      return typeof tile.value === "number" && [2, 5, 8].includes(tile.value);
    }

    if (eye) {
      const eyeTile = schema.tiles[eye];
      if (!validEye(eyeTile)) return false;
      const matching = tiles.filter((other) => eq(eyeTile, other) || isWild(other));
      if (matching.length < 2) return false;
      const remaining = [...tiles];
      remaining.splice(remaining.indexOf(matching[0]), 1);
      remaining.splice(remaining.indexOf(matching[1]), 1);
      if (allMeld(remaining)) return true;
    } else {
      for (let i = 0; i < tiles.length; i++) {
        if (!validEye(tiles[i])) continue;
        for (let j = i + 1; j < tiles.length; j++) {
          if (!eq(tiles[i], tiles[j]) && !isWild(tiles[i]) && !isWild(tiles[j])) continue;
          if (isWild(tiles[i]) && !isWild(tiles[j]) && !validEye(tiles[j])) continue;
          const remaining = [...tiles];
          remaining.splice(j, 1);
          remaining.splice(i, 1);
          if (allMeld(remaining)) return true;
        }
      }
      return false;
    }
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

    this.tiles = basis.tiles || shuffle([...tiles()]);
    this.walls = basis.walls || [...walls(this.tiles.length)];
    this.indicator = basis.indicator;
    this.wildcard = basis.wildcard;
    this.scores = basis.scores || {};
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
      throw new Error(`No player ${name} in game ${this.game}`);
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

    const draw = this.walls[wall][stack].pop();
    this.drawn = draw;
    this.source = "front";
    this[winds[0]].up.push(draw);

    const [indWall, indStack] = this.reverseDraw();
    this.indicator = this.walls[indWall][indStack].pop();
    this.wildcard = nextTileType(this.tiles[this.indicator]);
  }

  addPlayer(name, position) {
    this.assertStarted(false);
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
    return new Message("addPlayer", { position, name });
  }

  removePlayer(name) {
    this.assertStarted(false);
    const position = this.playerWind(name);
    delete this[position];
    return new Message("removePlayer", { position });
  }

  readyPlayer(name, ready = true) {
    this.assertStarted(false);
    const position = this.playerWind(name);
    this[position].ready = ready;
    const allPlayers = WINDS.map((position) => this[position]).filter(
      (player) => !!player,
    );

    if (allPlayers.length >= 2 && allPlayers.every((player) => player.ready)) {
      return this.start();
    }

    return new Message("readyPlayer", { position, ready });
  }

  assertStarted(started) {
    if (this.started !== started) {
      throw new Error(
        `The game ${this.name} has ${started ? "not" : "already"} started.`,
      );
    }
  }

  draw(position) {
    if (position !== this.turn || this.drawn !== undefined) {
      throw new Error(`It is not ${name}'s turn to draw.`);
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
    let i = this[position].up.findIndex((tile) =>
      eq(this.tiles[tile], discard),
    );
    if (i === -1 && this.wildcard) {
      i = this[position].up.findIndex((tile) =>
        eq(this.tiles[tile], this.wildcard),
      );
    }
    const [leftEye] = this[position].up.splice(i, 1);

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
    return new Message("win", { position, eyes, reveal: this.tiles, kong, allClear, allFromOthers, scores: this.scores });
  }

  computeRoundScore(position) {
    const winner = this[position];
    const allTiles = [...winner.up, ...winner.down.flat()]
      .filter((t) => typeof t === "number")
      .map((t) => this.tiles[t]);

    const isDealer = position === "Ton";
    const isSelfDraw = this.source === "front" || this.source === "back";

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
      const noWildSchema = { ...this, wildcard: null };
      return Schema.winningHand(noWildSchema, winner);
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
      if (hasNoWildcard) score *= 2;
      for (let i = 0; i < kongCount + loserKongCount; i++) score *= 2;
      for (let i = 0; i < pairsFourOfAKind; i++) score *= 2;
      return score;
    }

    return { isSelfDraw, calcLoserScore };
  }

  updateScores(position) {
    const { isSelfDraw, calcLoserScore } = this.computeRoundScore(position);
    const winnerName = this[position].name;
    if (!this.scores[winnerName]) this.scores[winnerName] = 0;

    let winnerTotal = 0;
    for (const wind of WINDS) {
      if (this[wind] && wind !== position) {
        const isLoserDealer = wind === "Ton";
        const isLoserDiscarder = isSelfDraw || wind === this.previousTurn;
        const loserKongCount = this[wind].down.filter((meld) => meld.length >= 5).length;
        const payment = Math.min(30, calcLoserScore(isLoserDealer, isLoserDiscarder, loserKongCount));
        const name = this[wind].name;
        if (!this.scores[name]) this.scores[name] = 0;
        this.scores[name] -= payment;
        winnerTotal += payment;
      }
    }
    this.scores[winnerName] += winnerTotal;
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
    return new Message("win", { position, reveal: this.tiles, kong, allClear, allFromOthers, scores: this.scores });
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
        if (!this[wind] || wind === position) continue;
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
    } while (!this[this.turn]);
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
