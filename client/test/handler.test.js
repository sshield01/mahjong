import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hasActions } from "../src/game/handler.js";

// `hasActions` decides whether a discard is worth pausing for, and that decision
// arms the claim clock -- which is what puts 想想/过 on screen and makes the
// discard claimable. Answer "no" wrongly and the seat casts its automatic vote
// instead: the claim disappears with no button ever shown and nothing to see
// afterwards. That silence is why these cases are worth pinning down.
//
// It reads a plain object, not a live Schema, so the fixtures below are built by
// hand -- a deck, a seat, and whose turn it is.

const P = (value) => ({ suit: "Pin", value });
const S = (value) => ({ suit: "Sou", value });
const W = (value) => ({ suit: "wind", value });

// Lays the given tiles out as a deck and hands the listed indices to a seat.
// `discarded` indexes into the same deck, so the discard and the hand are always
// talking about the same tiles.
function table({ tiles, hand, discarded, turn = "Nan", previousTurn = "Ton", seat = "Nan", down = [], wildcard }) {
  return {
    tiles,
    wildcard,
    turn,
    previousTurn,
    discarded,
    [seat]: { up: hand, down },
  };
}

describe("whether a discard is worth pausing for", () => {
  test("a spectator has nothing to claim with", () => {
    const schema = table({ tiles: [P(1)], hand: [], discarded: 0 });
    assert.equal(hasActions(schema, undefined), false);
  });

  test("no discard on the table means nothing to answer", () => {
    const schema = table({ tiles: [P(1)], hand: [], discarded: undefined });
    assert.equal(hasActions(schema, "Nan"), false);
  });

  // Tile 0 is a legitimate index, and `!schema.discarded` treats it as absent.
  test("the very first tile of the deck still counts as a discard", () => {
    const tiles = [P(3), P(3), P(3)];
    const schema = table({ tiles, hand: [1, 2], discarded: 0 });
    assert.equal(hasActions(schema, "Nan"), true, "two in hand is a 碰");
  });

  test("nobody claims their own discard", () => {
    const tiles = [P(3), P(3), P(3)];
    const schema = table({ tiles, hand: [1, 2], discarded: 0, previousTurn: "Nan" });
    assert.equal(hasActions(schema, "Nan"), false);
  });

  test("a wildcard on the table cannot be claimed at all", () => {
    const tiles = [P(3), P(3), P(3)];
    const schema = table({ tiles, hand: [1, 2], discarded: 0, wildcard: P(3) });
    assert.equal(hasActions(schema, "Nan"), false);
  });

  test("a tile this client may not see is not guessed at", () => {
    const schema = table({ tiles: [null, P(3), P(3)], hand: [1, 2], discarded: 0 });
    assert.equal(hasActions(schema, "Nan"), false, "a hidden discard reveals no claim");
  });

  test("two matching tiles is a claim, one is not", () => {
    const pair = table({ tiles: [P(5), P(5), P(5), S(9)], hand: [1, 2], discarded: 0 });
    assert.equal(hasActions(pair, "Nan"), true);

    const single = table({ tiles: [P(5), P(5), S(9)], hand: [1, 2], discarded: 0 });
    assert.equal(hasActions(single, "Nan"), false);
  });

  describe("runs", () => {
    // 4-Pin discarded, 5 and 6 in hand: a run for whoever may take it.
    const RUN_DECK = [P(4), P(5), P(6), W("Ton"), W("Ton")];

    test("the seat in turn may chow", () => {
      const schema = table({ tiles: RUN_DECK, hand: [1, 2, 3, 4], discarded: 0, turn: "Nan" });
      assert.equal(hasActions(schema, "Nan"), true);
    });

    test("a seat out of turn may not chow for its own sake", () => {
      const schema = table({ tiles: RUN_DECK, hand: [1, 2, 3, 4], discarded: 0, turn: "Shaa" });
      assert.equal(
        hasActions(schema, "Nan"),
        false,
        "taking the tile as a 吃 belongs to the player in turn",
      );
    });

    // The bug this exists for: 吃 is turn-only, but going out on the run is not.
    // The check for runs used to hang off the turn test, so off-turn a winning
    // run was seen by nobody -- the table offered the 胡 while this client, with
    // no clock armed, voted the win away by itself.
    test("but any seat may go out on one", () => {
      // 2-Pin discarded completes 3-4 into a run; the rest of the hand is already
      // three triplets and a pair. The pair is 5-Pin because the eye has to be a
      // 将 -- a numbered 2, 5 or 8 -- so an honour pair would fail the hand for
      // reasons that have nothing to do with the run.
      const tiles = [
        P(2), P(3), P(4),
        P(7), P(7), P(7),
        S(1), S(1), S(1),
        S(9), S(9), S(9),
        P(5), P(5),
      ];
      const hand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
      const schema = table({ tiles, hand, discarded: 0, turn: "Shaa" });

      assert.equal(
        hasActions(schema, "Nan"),
        true,
        "a hand that goes out on the run must arm the clock whoever's turn it is",
      );
    });
  });

  test("the discard taken as the eye pair is a claim", () => {
    // A lone 5-Pin waiting for its partner, everything else already melded. A 5
    // because the eye must be a 将 -- the claimed tile itself has to pass that
    // test before it can be taken as the pair.
    const tiles = [
      P(5), P(5),
      P(7), P(7), P(7),
      S(1), S(1), S(1),
      S(9), S(9), S(9),
      P(2), P(3), P(4),
    ];
    const hand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const schema = table({ tiles, hand, discarded: 0, turn: "Shaa" });

    assert.equal(hasActions(schema, "Nan"), true);
  });

  test("an honour pair is no eye, so the same shape is not a claim", () => {
    // Identical to the hand above but pairing 北, which is not a 将. The table
    // must not pause for a 胡 the server would refuse.
    const tiles = [
      W("Pei"), W("Pei"),
      P(7), P(7), P(7),
      S(1), S(1), S(1),
      S(9), S(9), S(9),
      P(2), P(3), P(4),
    ];
    const hand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const schema = table({ tiles, hand, discarded: 0, turn: "Shaa" });

    assert.equal(hasActions(schema, "Nan"), false);
  });

  test("a hand with nothing to say answers no", () => {
    const tiles = [P(1), S(9), W("Ton"), P(5), S(3)];
    const schema = table({ tiles, hand: [1, 2, 3, 4], discarded: 0, turn: "Shaa" });
    assert.equal(hasActions(schema, "Nan"), false);
  });
});
