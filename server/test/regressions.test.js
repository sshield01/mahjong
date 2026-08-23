// Regression tests for bugs fixed before the suite existed. Each names the
// commit it locks down, so the intended rule is traceable to when it was decided.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import Schema from "../lib/schema.js";

const W = (value) => ({ suit: "wind", value });
const D = (value) => ({ suit: "dragon", value });
const T = (suit, value) => ({ suit, value });

// Builds a schema whose tile array is exactly what the test lays out, so hands
// can be stated directly instead of fished out of a shuffled wall.
function table() {
  const tiles = [];
  const put = (list) => list.map((t) => (tiles.push(t), tiles.length - 1));
  const schema = new Schema({ name: "r", tiles, walls: [] });
  const seat = (position, name, { up = [], down = [], exposedWildcards = [] } = {}) => {
    schema[position] = {
      name,
      up: put(up),
      down: down.map(put),
      discarded: [],
      ready: false,
      exposedWildcards: [],
    };
    // Exposed wildcards are indices already inside `up`.
    schema[position].exposedWildcards = exposedWildcards.map(
      (i) => schema[position].up[i],
    );
    return schema[position];
  };
  return { schema, seat, put };
}

describe("wildcard win rules", () => {
  // 3dacd3d "fix a bug of mistakenly detecting a win when there is 2 wildcards"
  //
  // Holding two wildcards is only allowed to win if the hand is concealed, has
  // an exposed wildcard, or is a single suit. A melded, mixed-suit hand with two
  // wildcards used to be scored as a win.
  const meldedTwoWildcards = (extra) => {
    const { schema, seat } = table();
    schema.wildcard = T("Pin", 1);
    // Eye is the two wildcards; the rest is three clean melds.
    const up = [
      T("Pin", 1), T("Pin", 1),
      T("Sou", 2), T("Sou", 3), T("Sou", 4),
      T("Man", 5), T("Man", 5), T("Man", 5),
      T("Sou", 7), T("Sou", 8), T("Sou", 9),
    ];
    const player = seat("Ton", "A", {
      up,
      down: [[T("Man", 1), T("Man", 1), T("Man", 1)]],
      ...extra,
    });
    return { schema, player };
  };

  test("two wildcards in a melded, mixed-suit hand is not a win", () => {
    const { schema, player } = meldedTwoWildcards({});
    assert.equal(Schema.winningHand(schema, player), false);
  });

  // 2caa016 "Added exposed wild card to waive minimum win requirement"
  test("exposing a wildcard waives that restriction", () => {
    const { schema, player } = meldedTwoWildcards({ exposedWildcards: [0] });
    assert.equal(Schema.winningHand(schema, player), true);
  });

  // 5ff2da8 "fix a bug when 2 wildcards with concealed hand"
  test("a fully concealed hand may still win on two wildcards", () => {
    const { schema, seat } = table();
    schema.wildcard = T("Pin", 1);
    const player = seat("Ton", "A", {
      up: [
        T("Pin", 1), T("Pin", 1),
        T("Sou", 2), T("Sou", 3), T("Sou", 4),
        T("Man", 5), T("Man", 5), T("Man", 5),
        T("Sou", 7), T("Sou", 8), T("Sou", 9),
        T("Man", 1), T("Man", 1), T("Man", 1),
      ],
      down: [], // nothing melded -- 门清
    });
    assert.equal(Schema.winningHand(schema, player), true);
  });
});

describe("claims advertised on a discard", () => {
  // 27634b0 "bug found by claude code"
  //
  // `hasClaims` drives the pause other players get before their auto-vote fires.
  // It used to force the discard to be the *pair*, so a player who would win
  // because the tile completes a run was never given time to claim it.
  test("a win completing a run counts as a claim", () => {
    const { schema, seat, put } = table();
    // Burn index 0 so the discarded tile is not the falsy index -- otherwise this
    // test would pass for the wrong reason (see the tile-index-0 test below).
    put([T("Man", 9)]);
    seat("Ton", "A", { up: [T("Sou", 3)] });
    seat("Nan", "B", {
      up: [
        T("Sou", 1), T("Sou", 2), // Sou3 completes this run
        T("Sou", 4), T("Sou", 5), T("Sou", 6),
        T("Sou", 7), T("Sou", 8), T("Sou", 9),
        T("Pin", 3), T("Pin", 4), T("Pin", 5),
        T("Man", 2), T("Man", 2), // eye
      ],
    });
    schema.turn = "Ton";

    const message = schema.discard("A", schema.Ton.up[0]);
    assert.equal(message.body.hasClaims, true, "B must be given time to declare");
  });

  // 2a888a2 / 3c9dfc0 -- the speed-up relies on this being false so players are
  // not made to sit through a delay when nobody could act.
  test("no claim is advertised when nobody can act on the tile", () => {
    const { schema, seat } = table();
    seat("Ton", "A", { up: [T("Sou", 3)] });
    seat("Nan", "B", {
      up: [
        W("Ton"), W("Nan"), W("Shaa"), W("Pei"),
        D("Chun"), D("Hatsu"), D("Haku"),
        T("Pin", 1), T("Pin", 4), T("Pin", 7),
        T("Man", 1), T("Man", 4), T("Man", 7),
      ],
    });
    schema.turn = "Ton";

    const message = schema.discard("A", schema.Ton.up[0]);
    assert.equal(message.body.hasClaims, false, "nothing to wait for");
  });
});

describe("the eye constraint", () => {
  // Found while mutation-testing the claim tests: `winningHand`'s third argument
  // is a tile *index*, and index 0 is falsy, so claiming the very first tile in
  // the deck skipped the "this tile must be the pair" check altogether. `eyes()`
  // relies on that check to reject a claim, so a 1-in-136 discard could be taken
  // as an eyes-win by a hand that does not pair it.
  test("tile index 0 is still held to the eye rule", () => {
    const { schema, seat } = table();
    // Index 0 is the discard, and it cannot be the pair: the hand wins on a run.
    seat("Ton", "A", { up: [T("Sou", 3)] });
    seat("Nan", "B", {
      up: [
        T("Sou", 1), T("Sou", 2),
        T("Sou", 4), T("Sou", 5), T("Sou", 6),
        T("Sou", 7), T("Sou", 8), T("Sou", 9),
        T("Pin", 3), T("Pin", 4), T("Pin", 5),
        T("Man", 2), T("Man", 2),
      ],
    });
    const discarded = schema.Ton.up[0];
    assert.equal(discarded, 0, "this test is only meaningful for index 0");

    const claimant = { ...schema.Nan, up: [...schema.Nan.up, discarded] };
    assert.equal(
      Schema.winningHand(schema, claimant),
      true,
      "the hand does win with that tile...",
    );
    assert.equal(
      Schema.winningHand(schema, claimant, discarded),
      false,
      "...but not by using it as the pair, so an eyes-claim must be refused",
    );
  });
});

describe("scoring", () => {
  // Seven pairs of winds: all-pairs, all-winds and one suit at once, which piles
  // up enough bonuses to run past the cap.
  function sevenPairsWin() {
    const { schema, seat } = table();
    seat("Ton", "A", {
      up: [
        W("Ton"), W("Ton"), W("Ton"), W("Ton"),
        W("Nan"), W("Nan"), W("Nan"), W("Nan"),
        W("Shaa"), W("Shaa"), W("Shaa"), W("Shaa"),
        W("Pei"), W("Pei"),
      ],
    });
    seat("Nan", "B", { up: [] });
    schema.turn = "Ton";
    schema.previousTurn = "Nan";
    schema.source = "front"; // self-drawn
    return schema;
  }

  // 9533456 "show raw score when it is capped at -30"
  test("a loser never pays more than 30", () => {
    const schema = sevenPairsWin();
    const { calcLoserScore } = schema.computeRoundScore("Ton");
    const raw = calcLoserScore(false, true, 0);
    assert.ok(raw > 30, `this hand should out-score the cap (raw ${raw})`);

    schema.updateScores("Ton");
    assert.equal(schema.scores.B, -30, "payment is capped");
    assert.equal(schema.scores.A, 30, "and the winner receives the capped amount");
  });

  // d4439f7 "fix a bug when pongpong and all pairs are both counted"
  test("an all-pairs hand does not also collect the pongpong bonus", () => {
    const schema = sevenPairsWin();
    const { calcLoserScore } = schema.computeRoundScore("Ton");
    const withCombo = calcLoserScore(false, false, 0);

    // Same hand scored as if all-pairs did not apply would add pongpong's +5
    // instead of all-pairs' +10; the two must never stack.
    assert.ok(
      withCombo > 0,
      "sanity: the hand scores at all",
    );
    // The guard is `isPongpong && !isAllPairs`, so an all-pairs hand must score
    // exactly the all-pairs bonus and nothing for pongpong.
    const base = 2; // dealer doubles the base of 1
    const bonuses = 5 /* 门清 */ + 10 /* 七对 */ + 10 /* 全风 */ + 10 /* 清一色 */;
    const doubled = (base + bonuses) * 2; /* 无癞子 */
    const fourOfAKind = 2 ** 3; /* Ton, Nan, Shaa each appear four times */
    assert.equal(withCombo, doubled * fourOfAKind);
  });

  // bd20e1c "If the wildcard tiles are used as their face value, it is scored
  // as no wildcard"
  test("a wildcard played at face value still counts as a wildcard-free win", () => {
    const schema = sevenPairsWin();
    // Make one of the tiles in hand the wildcard. The hand wins either way --
    // all winds -- so the wildcard is being used as its own face value.
    schema.wildcard = W("Pei");

    const { calcLoserScore } = schema.computeRoundScore("Ton");
    const withFaceValueWildcard = calcLoserScore(false, false, 0);

    schema.wildcard = undefined;
    const withNoWildcardAtAll = schema
      .computeRoundScore("Ton")
      .calcLoserScore(false, false, 0);

    assert.equal(
      withFaceValueWildcard,
      withNoWildcardAtAll,
      "holding the wildcard but not relying on it keeps the 无癞子 doubling",
    );
  });
});
