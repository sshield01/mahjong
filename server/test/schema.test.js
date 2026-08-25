import { test, describe } from "node:test";
import assert from "node:assert/strict";
import Schema, { player } from "../lib/schema.js";
import { allWindTiles } from "./helpers.js";

function seat(schema, position, name) {
  schema.addPlayer(name, position);
  return schema;
}

describe("seating and host", () => {
  test("the first player to sit becomes host", () => {
    const schema = new Schema({ name: "r" });
    seat(schema, "Nan", "Bob");
    seat(schema, "Ton", "Alice");
    assert.equal(schema.host, "Bob", "host is whoever sat first, not whoever holds Ton");
  });

  test("a seat cannot be taken twice, and one player cannot hold two seats", () => {
    const schema = new Schema({ name: "r" });
    seat(schema, "Ton", "Alice");
    assert.throws(() => schema.addPlayer("Bob", "Ton"), /already taken/);
    assert.throws(() => schema.addPlayer("Alice", "Nan"), /already has a seat/);
    assert.throws(() => schema.addPlayer("Bob", "Middle"), /not a valid seat/);
  });

  test("removing the host hands the role to a remaining player", () => {
    const schema = new Schema({ name: "r" });
    seat(schema, "Ton", "Alice");
    seat(schema, "Nan", "Bob");
    assert.equal(schema.host, "Alice");
    schema.removePlayer("Alice");
    assert.equal(schema.host, "Bob");
  });

  test("seatOf tolerates a spectator; playerWind still throws", () => {
    const schema = new Schema({ name: "r" });
    seat(schema, "Ton", "Alice");
    assert.equal(schema.seatOf("Alice"), "Ton");
    assert.equal(schema.seatOf("nobody"), undefined);
    assert.throws(() => schema.playerWind("nobody"));
  });
});

describe("starting a game", () => {
  // Regression: `start()` dealt the 14th tile to the first *occupied* seat but
  // left `turn` at its "Ton" default. With Ton empty nobody could ever act.
  test("turn points at the dealer even when the Ton seat is empty", () => {
    const schema = new Schema({ name: "r" });
    seat(schema, "Nan", "Bob");
    seat(schema, "Shaa", "Cara");
    schema.start();

    assert.equal(schema.turn, "Nan", "turn must name an occupied seat");
    assert.equal(schema.previousTurn, "Nan");
    assert.ok(schema[schema.turn], "the seat named by turn must exist");
    assert.equal(schema[schema.turn].up.length, 14, "the dealer holds the 14th tile");
  });

  // Found by a flaky run of the suite. Where dealing stops in the wall depends on
  // the dice roll, and one wall access lacked the bounds wrap every other one
  // had, so certain rolls crashed the deal outright. Deal many times so the rare
  // roll is actually hit rather than waiting to meet it in a real game.
  test("dealing survives every dice roll", () => {
    for (let seats = 2; seats <= 4; seats++) {
      for (let attempt = 0; attempt < 300; attempt++) {
        const schema = new Schema({ name: "r" });
        ["Ton", "Nan", "Shaa", "Pei"]
          .slice(0, seats)
          .forEach((position, i) => seat(schema, position, `P${i}`));

        schema.start();

        const dealt = schema.seatedPlayers();
        assert.equal(dealt.length, seats);
        assert.ok(
          dealt.every((p) => p.up.every((t) => typeof t === "number")),
          `roll ${schema.roll} dealt a missing tile to a ${seats}-player table`,
        );
        assert.equal(schema[schema.turn].up.length, 14);
      }
    }
  });

  test("every seated player is dealt in", () => {
    const schema = new Schema({ name: "r" });
    seat(schema, "Ton", "Alice");
    seat(schema, "Nan", "Bob");
    seat(schema, "Shaa", "Cara");
    schema.start();

    assert.equal(schema.Ton.up.length, 14);
    assert.equal(schema.Nan.up.length, 13);
    assert.equal(schema.Shaa.up.length, 13);
    assert.equal(schema.Pei, undefined);
    assert.ok(schema.wildcard, "a wildcard is chosen from the indicator");
  });
});

describe("concealed views", () => {
  test("a seated player sees their own hand and nobody else's", () => {
    const schema = new Schema({ name: "r" });
    seat(schema, "Ton", "Alice");
    seat(schema, "Nan", "Bob");
    schema.start();

    const view = Schema.concealed(schema, "Alice");
    assert.ok(view.Ton.up.every((t) => view.tiles[t] !== null), "own tiles visible");
    assert.ok(view.Nan.up.every((t) => view.tiles[t] === null), "opponent tiles hidden");
  });

  // Regression: concealed() used the throwing playerWind, so building a view for
  // a spectator blew up instead of simply revealing nothing.
  test("a spectator gets a view with no hands revealed", () => {
    const schema = new Schema({ name: "r" });
    seat(schema, "Ton", "Alice");
    seat(schema, "Nan", "Bob");
    schema.start();

    const view = Schema.concealed(schema, "watcher");
    assert.ok(view.Ton.up.every((t) => view.tiles[t] === null));
    assert.ok(view.Nan.up.every((t) => view.tiles[t] === null));
  });
});

describe("next game", () => {
  test("carries the host and the running scores", () => {
    const first = new Schema({ name: "r" });
    seat(first, "Ton", "Alice");
    seat(first, "Nan", "Bob");
    first.scores = { Alice: 30, Bob: -30 };
    first.started = true;
    first.completed = true;
    first.turn = "Nan";

    const next = Schema.nextGame(first, first);
    assert.equal(next.host, "Alice", "the host keeps running the table");
    assert.deepEqual(next.scores, { Alice: 30, Bob: -30 });
    assert.equal(next.started, false);
    assert.ok(next.seatedPlayers().every((p) => p.ready === false), "nobody is pre-readied");
  });

  test("the dealer keeps the deal after winning", () => {
    const first = new Schema({ name: "r" });
    seat(first, "Ton", "Alice");
    seat(first, "Nan", "Bob");
    first.started = true;
    first.completed = true;
    first.turn = "Ton"; // the dealer won

    const next = Schema.nextGame(first, first);
    assert.equal(next.Ton.name, "Alice", "seats do not rotate when the dealer wins");
  });
});

describe("dealer scoring by seat", () => {
  // Regression: the dealer (庄家) doubles the base point, but scoring identified
  // the dealer by the hardcoded "Ton" seat while the rest of the code treats the
  // dealer as the first *occupied* seat. Players pick their own seats now, so Ton
  // is often empty -- and whenever the dealer sat elsewhere the double vanished.

  // A win of four chows and a pair, across all three suits and including
  // terminals: no hand bonus applies (not pongpong, not one-suit, not all-jiang,
  // not seven-pairs), so the base point and its dealer doubling are all that move.
  function deckWithPlainWin() {
    const tiles = [
      { suit: "Pin", value: 1 }, { suit: "Pin", value: 2 }, { suit: "Pin", value: 3 },
      { suit: "Pin", value: 4 }, { suit: "Pin", value: 5 }, { suit: "Pin", value: 6 },
      { suit: "Sou", value: 7 }, { suit: "Sou", value: 8 }, { suit: "Sou", value: 9 },
      { suit: "Man", value: 1 }, { suit: "Man", value: 2 }, { suit: "Man", value: 3 },
      { suit: "Man", value: 9 }, { suit: "Man", value: 9 },
    ];
    while (tiles.length < 136) tiles.push({ suit: "wind", value: "Pei" });
    return tiles;
  }
  const WIN_HAND = Array.from({ length: 14 }, (_, i) => i);
  // A wildcard absent from that hand, so 无癞子 doubles every payment identically
  // and drops out of any comparison.
  const WILDCARD = { suit: "dragon", value: "Haku" };

  test("the dealer-winner's double follows the dealer's seat, not the Ton chair", () => {
    // Dealer sitting in Ton -- the case the old hardcoded check happened to get right.
    const inTon = new Schema({ tiles: deckWithPlainWin(), wildcard: WILDCARD });
    inTon.Ton = { ...player("Alice"), up: [...WIN_HAND] };
    inTon.Nan = { ...player("Bob") };
    inTon.Shaa = { ...player("Cara") };
    inTon.source = "discard";
    inTon.turn = "Ton";
    inTon.previousTurn = "Nan"; // Bob fed the winning tile
    inTon.updateScores("Ton");

    // Same players and hands, shifted one seat on so the dealer sits in Nan with
    // Ton empty. The scores must come out identical -- the double is the dealer's,
    // not the chair's.
    const offTon = new Schema({ tiles: deckWithPlainWin(), wildcard: WILDCARD });
    offTon.Nan = { ...player("Alice"), up: [...WIN_HAND] };
    offTon.Shaa = { ...player("Bob") };
    offTon.Pei = { ...player("Cara") };
    offTon.source = "discard";
    offTon.turn = "Nan";
    offTon.previousTurn = "Shaa"; // Bob fed the winning tile
    offTon.updateScores("Nan");

    assert.deepEqual(offTon.scores, inTon.scores, "dealer double must not depend on the Ton seat");
    assert.ok(inTon.scores.Alice > 0, "the dealer collects");
    assert.ok(inTon.scores.Bob < inTon.scores.Cara, "the discarder pays more than the idle seat");
  });

  test("a dealer who loses pays the doubled base wherever they sit", () => {
    // Ton empty, so Nan is the dealer -- and here a losing seat. A self-draw makes
    // every other seat pay as the "discarder", so the only thing separating the
    // dealer-loser from the plain loser is the dealer double itself.
    const schema = new Schema({ tiles: deckWithPlainWin(), wildcard: WILDCARD });
    schema.Nan = { ...player("Alice") };                     // dealer, loser
    schema.Shaa = { ...player("Cara"), up: [...WIN_HAND] };  // winner (self-draw)
    schema.Pei = { ...player("Dora") };                      // non-dealer, loser
    schema.source = "front";
    schema.turn = "Shaa";
    schema.previousTurn = "Shaa";
    schema.updateScores("Shaa");

    assert.ok(
      schema.scores.Alice < schema.scores.Dora,
      "the dealer pays more than a non-dealer, even seated off Ton",
    );
  });
});

describe("winning hands", () => {
  test("an all-winds hand wins", () => {
    const schema = new Schema({ name: "r", tiles: allWindTiles() });
    seat(schema, "Ton", "Alice");
    seat(schema, "Nan", "Bob");
    schema.start();
    assert.equal(Schema.winningHand(schema, schema[schema.turn]), true);
  });

  test("a plain 13-tile hand is not a win", () => {
    const schema = new Schema({ name: "r", tiles: allWindTiles() });
    seat(schema, "Ton", "Alice");
    seat(schema, "Nan", "Bob");
    schema.start();
    // 13 tiles is 13 % 3 === 1, never a winning shape.
    assert.equal(Schema.winningHand(schema, schema.Nan), false);
  });
});

describe("claiming a run", () => {
  // Taking a discard as a 吃 belongs to the player in turn, but going out on the
  // run it completes does not -- a Win outranks every other vote, whoever casts
  // it. The client leans on that: it arms the claim clock for a run that wins
  // from any seat, and only offers the plain 吃 to the seat in turn. If this ever
  // starts requiring the turn, that clock stops arming and the seat holding the
  // winning hand answers `ignore` on its own, throwing the win away in silence.
  test("a seat that is not in turn may still chow", () => {
    // Three 1-Pin, three 2-Pin, three 3-Pin, then plain filler, so whoever holds
    // the 2 and 3 can take a 1 off the table.
    const tiles = [];
    for (let i = 0; i < 3; ++i) tiles.push({ suit: "Pin", value: 1 });
    for (let i = 0; i < 3; ++i) tiles.push({ suit: "Pin", value: 2 });
    for (let i = 0; i < 3; ++i) tiles.push({ suit: "Pin", value: 3 });
    while (tiles.length < 136) tiles.push({ suit: "Man", value: 9 });

    const schema = new Schema({ name: "r", tiles });
    seat(schema, "Ton", "Alice");
    seat(schema, "Nan", "Bob");
    seat(schema, "Shaa", "Cass");
    schema.started = true;

    // Ton has discarded a 1-Pin. The turn has passed to Nan, so Shaa is the seat
    // that is emphatically not in turn.
    schema.Ton = { ...schema.Ton, up: [], down: [], discarded: [0] };
    schema.Shaa = { ...schema.Shaa, up: [3, 6], down: [], discarded: [] };
    schema.previousTurn = "Ton";
    schema.turn = "Nan";
    schema.discarded = 0;

    const message = schema.chow("Shaa", [3, 6]);

    assert.equal(message.subject, "take");
    assert.deepEqual(schema.Shaa.down, [[3, 6, 0]], "the run is melded");
    assert.equal(schema.turn, "Shaa", "and the turn follows the claim");
  });

  test("no kong once the hand is down to its last lap", () => {
    const schema = new Schema({ name: "r", tiles: allWindTiles() });
    seat(schema, "Ton", "Alice");
    seat(schema, "Nan", "Bob");
    schema.start();

    assert.equal(schema.finalRound(), false, "a full wall is not the last lap");
    assert.doesNotThrow(() => schema.assertKongAllowed(), "and kongs are fine there");

    // Run the wall down past the threshold: the dead wall plus one tile a seat.
    schema.walls = [[[0, 1], [2, 3]], [], [], []];
    assert.equal(schema.finalRound(), true);

    // Every kong replaces from the back of the wall, so every kind is refused --
    // and refused before its own checks, so the reason given is the real one
    // rather than whichever precondition happened to fail next.
    assert.throws(() => schema.concealedKong("Alice", 0), /last lap/);
    assert.throws(() => schema.augmentedKong("Alice", 0), /last lap/);
    assert.throws(() => schema.exposedKong("Nan"), /last lap/);
  });

  test("but nobody may pick up their own discard", () => {
    const schema = new Schema({ name: "r", tiles: allWindTiles() });
    seat(schema, "Ton", "Alice");
    seat(schema, "Nan", "Bob");
    schema.started = true;
    schema.previousTurn = "Ton";
    schema.turn = "Nan";
    schema.discarded = 0;

    assert.throws(() => schema.chow("Ton", [1, 2]), /your own discard/);
  });
});
