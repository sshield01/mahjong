// Regression tests for bugs fixed before the suite existed. Each names the
// commit it locks down, so the intended rule is traceable to when it was decided.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import Schema, { eq, LAST_LAP_NOTICE } from "../lib/schema.js";
import Vote, { handle } from "../game/votes.js";
import playFinalRound from "../game/finalRound.js";

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

describe("the 海底 round", () => {
  // Everything past the ten-tile dead wall is one last draw per seat, taken
  // without discarding: win on the tile you drew and it is 海底捞 (+10), and if
  // the lap goes round with nobody out the hand is 黄庄.
  function tableWithWall(remaining, seats = ["Ton", "Nan", "Shaa", "Pei"]) {
    const { schema, seat } = table();
    seats.forEach((position, i) => seat(position, `P${i}`, { up: [] }));
    // One tile per stack, so the count is exactly what we asked for.
    schema.walls = [[], [], [], []];
    for (let i = 0; i < remaining; i++) schema.walls[i % 4].push([i]);
    schema.roll = [1, 1, 1]; // drawOrder needs a break to walk from
    return schema;
  }

  test("the last lap starts once the wall is down to a draw per seat", () => {
    const four = tableWithWall(15);
    assert.equal(four.tilesRemaining(), 15);
    assert.equal(four.finalRound(), false, "15 left at a full table is still ordinary play");

    const atFourteen = tableWithWall(14);
    assert.equal(atFourteen.finalRound(), true, "14 left is the last four tiles");

    // A shorter table takes a shorter lap, so the dead wall is still ten.
    const three = tableWithWall(13, ["Ton", "Nan", "Shaa"]);
    assert.equal(three.finalRound(), true, "three seats, three final draws");
    assert.equal(tableWithWall(14, ["Ton", "Nan"]).finalRound(), false);
    assert.equal(tableWithWall(12, ["Ton", "Nan"]).finalRound(), true);
  });

  test("黄庄 pays the dealer two from every other seat and keeps the deal", () => {
    const { schema, seat } = table();
    seat("Ton", "A", { up: [] });
    seat("Nan", "B", { up: [] });
    seat("Shaa", "C", { up: [] });
    schema.started = true;

    const message = schema.washOut();

    assert.equal(message.subject, "win");
    assert.equal(message.body.washedOut, true);
    assert.equal(message.body.position, "Ton", "the dealer takes the default win");
    assert.equal(schema.completed, true);
    assert.deepEqual(schema.scores, { A: 4, B: -2, C: -2 });

    // `nextGame` rotates the seats unless the dealer took the round, so leaving
    // `turn` on them is what keeps the deal.
    const next = Schema.nextGame(schema, schema);
    assert.equal(next.Ton.name, "A", "the dealer keeps the deal through a 黄庄");
  });

  // With Ton empty -- seats are chosen freely -- the default win still has to
  // land on whoever was dealt in, not on a seat nobody is sitting at.
  test("黄庄 falls back to the dealer's seat when 东 is empty", () => {
    const { schema, seat } = table();
    seat("Nan", "B", { up: [] });
    seat("Shaa", "C", { up: [] });
    schema.started = true;

    const message = schema.washOut();
    assert.equal(message.body.position, "Nan");
    assert.deepEqual(schema.scores, { B: 2, C: -2 });
  });

  // What the table marks up as the wall runs down: which tiles the 海底 round
  // will come from, and how many ordinary draws are left before it.
  test("lastLap names the tiles just short of the dead wall, and counts down", () => {
    const schema = tableWithWall(20);
    const order = schema.drawOrder();

    assert.equal(order.length, 20, "every tile still in the wall, in draw order");
    assert.equal(new Set(order).size, 20, "and each of them once");

    const { tiles, drawsAway } = schema.lastLap();
    assert.equal(drawsAway, 6, "20 left, four seats, ten reserved -- six ordinary draws to go");
    assert.deepEqual(tiles, order.slice(6, 10), "the four sitting just before the dead wall");

    // The ten behind them are the reserve and are never part of the lap.
    assert.equal(order.slice(10).length, 10);
    assert.ok(tiles.every((t) => !order.slice(10).includes(t)));

    // The mark goes on twelve draws out, which at a full table is the 26th tile
    // counting back from the end of the wall -- ten reserved, four for the lap,
    // twelve of warning ahead of them.
    assert.equal(tableWithWall(26).lastLap().drawsAway, LAST_LAP_NOTICE);
    assert.ok(tableWithWall(27).lastLap().drawsAway > LAST_LAP_NOTICE, "not a draw sooner");

    // Down to the lap itself, nothing is "away" any more.
    assert.equal(tableWithWall(14).lastLap().drawsAway, 0);
    assert.equal(tableWithWall(14).lastLap().tiles.length, 4);
    // And a shorter table takes a shorter lap.
    assert.equal(tableWithWall(20, ["Ton", "Nan"]).lastLap().tiles.length, 2);
    assert.equal(tableWithWall(20, ["Ton", "Nan"]).lastLap().drawsAway, 8);
  });

  // Drives the real module, not just the rules underneath it.
  function lastLap(hands, wallTiles) {
    const tiles = [];
    const put = (list) => list.map((t) => (tiles.push(t), tiles.length - 1));
    const schema = new Schema({ name: "r", tiles, walls: [[], [], [], []] });
    for (const [position, name, up] of hands) {
      schema[position] = {
        name, up: put(up), down: [], discarded: [], ready: false, exposedWildcards: [],
      };
    }
    // One tile per stack, all in one wall, so `nextDraw` walks them in order.
    for (const tile of put(wallTiles)) schema.walls[2].push([tile]);
    schema.started = true;
    schema.turn = hands[0][0];
    schema.previousTurn = hands[hands.length - 1][0];
    schema.roll = [1, 1, 1];
    return schema;
  }

  const JUNK = [
    T("Man", 1), T("Man", 4), T("Man", 7),
    T("Pin", 1), T("Pin", 4), T("Pin", 7),
    T("Sou", 1), T("Sou", 4), T("Sou", 7),
    W("Ton"), W("Nan"), D("Chun"), D("Haku"),
  ];

  test("winning on a last-lap tile ends the hand as 海底捞", () => {
    // All winds wins outright, and the wall is all winds too, so the very first
    // tile of the last lap completes it.
    const winds = ["Ton", "Nan", "Shaa", "Pei"];
    const hand = Array.from({ length: 13 }, (_, i) => W(winds[i % 4]));
    const wall = Array.from({ length: 12 }, (_, i) => W(winds[i % 4]));
    const schema = lastLap([["Ton", "A", hand], ["Nan", "B", [...JUNK]]], wall);
    assert.equal(schema.finalRound(), true, "12 left at a two-seat table is the last lap");

    const sent = [];
    const ended = playFinalRound({ emit: (m) => sent.push(m) }, schema);

    assert.equal(ended, true, "the last lap takes over and finishes the hand");
    assert.equal(schema.completed, true);
    assert.equal(schema.finalDraw, true, "flagged as 海底捞");
    assert.equal(schema.turn, "Ton", "the winner");
    assert.deepEqual(sent.map((m) => m.subject), ["draw", "win"]);
    assert.ok(schema.scores.A > 0 && schema.scores.B < 0);
  });

  test("a last lap with nobody out ends as 黄庄, leaving the dead wall alone", () => {
    const schema = lastLap(
      [["Ton", "A", [...JUNK]], ["Nan", "B", [...JUNK]]],
      Array.from({ length: 12 }, (_, i) => T("Man", (i % 9) + 1)),
    );

    const sent = [];
    const ended = playFinalRound({ emit: (m) => sent.push(m) }, schema);

    assert.equal(ended, true);
    assert.equal(schema.washedOut, true);
    assert.equal(schema.completed, true);
    assert.equal(
      sent.map((m) => m.subject).join(","),
      "draw,draw,win",
      "one draw per seat, then the result",
    );
    assert.equal(schema.tilesRemaining(), 10, "the ten-tile dead wall is never touched");
    assert.deepEqual(schema.scores, { A: 2, B: -2 });
  });

  test("海底捞 is worth ten on top of the hand", () => {
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
    schema.source = "front";

    const ordinary = schema.computeRoundScore("Ton").calcLoserScore(false, true, 0);
    schema.finalDraw = true;
    const onTheLastLap = schema.computeRoundScore("Ton").calcLoserScore(false, true, 0);

    // The bonus lands with the other flat bonuses, so the doublings that apply
    // to the hand apply to it too: 无癞子, and one for each four-of-a-kind.
    const multiplier = 2 * 2 ** 3; // 无癞子; Ton, Nan and Shaa each appear four times
    assert.equal(onTheLastLap - ordinary, 10 * multiplier);
  });
});

describe("resolving a vote round", () => {
  // The wall can be spent by the time a round resolves -- there is simply no
  // tile left to hand the winner. Throwing escaped vote resolution with the
  // round already deleted, and on the disconnect path, which runs on the way out
  // of a closed socket and has no message to fail, it went all the way up and
  // killed the process: every room in memory lost because one player closed a
  // tab while the wall happened to be empty.
  test("a spent wall does not throw out of the round", () => {
    const { schema, seat } = table();
    seat("Ton", "A", { up: [T("Sou", 1)] });
    seat("Nan", "B", { up: [T("Sou", 2)] });
    schema.walls = []; // nothing left to draw
    schema.turn = "Nan";
    schema.previousTurn = "Ton";
    schema.discarded = schema.Ton.up[0];

    const socket = { emit() {}, raw: { connected: false } };
    assert.doesNotThrow(() =>
      handle(socket, schema, { Nan: new Vote("Draw", 1) }),
    );
  });
});

describe("claiming a discard as the pair", () => {
  // Reported from play: 1-2-3萬 in hand with 6-7-8萬 melded, 7-7-7索, a spare 8索,
  // the wildcard (南), and 東東. Ton throws the 8索: it pairs the spare while the
  // wildcard fills out 東東東, so the hand wins outright. The claim was refused
  // anyway -- the tile would not highlight, and because the unconstrained check
  // still saw the win the table paused for a claim that could not be made.
  function wildcardInHandClaim() {
    const { schema, seat } = table();
    schema.wildcard = W("Nan");
    seat("Ton", "A", { up: [T("Sou", 8)] });
    seat("Nan", "B", {
      up: [
        T("Man", 1), T("Man", 2), T("Man", 3),
        T("Sou", 7), T("Sou", 7), T("Sou", 7),
        T("Sou", 8),
        W("Nan"), // the wildcard, standing in for a third 東
        W("Ton"), W("Ton"),
      ],
      down: [[T("Man", 6), T("Man", 7), T("Man", 8)]],
    });
    schema.turn = "Ton";
    schema.discard("A", schema.Ton.up[0]);
    return schema;
  }

  test("a wildcard in hand does not hide the pair the claim would make", () => {
    const schema = wildcardInHandClaim();
    const claimant = { ...schema.Nan, up: [...schema.Nan.up, schema.discarded] };

    assert.equal(
      Schema.winningHand(schema, claimant),
      true,
      "sanity: the hand does win with that tile",
    );
    assert.equal(
      Schema.winningHand(schema, claimant, schema.discarded),
      true,
      "...by pairing it, so the eyes claim has to be allowed",
    );
    assert.doesNotThrow(() => schema.eyes("Nan", false));
  });

  // `eyes()` moves a specific tile into the meld, so it asks `eyePartner` which
  // one rather than taking the first thing that matches. The wildcard is left
  // where it is more interesting to look at -- inside a meld -- and a real copy
  // is always available to pair with when one is in hand: a wildcard is at least
  // as flexible as the tile it stands in for, so whenever pairing with one wins,
  // pairing with a real copy wins too.
  test("the pair is made from a real copy, not the wildcard, when either would do", () => {
    // Three 5索 and the wildcard, so the claimed 5索 can pair with either: the
    // leftovers meld as 5索5索+wildcard, or as 5索5索5索. Both win, so the choice
    // is free and has to land on the real copy.
    const { schema, seat } = table();
    schema.wildcard = W("Nan");
    seat("Ton", "A", { up: [T("Sou", 5)] });
    seat("Nan", "B", {
      up: [
        T("Sou", 5), T("Sou", 5), T("Sou", 5),
        W("Nan"),
        T("Man", 1), T("Man", 2), T("Man", 3),
        T("Man", 7), T("Man", 8), T("Man", 9),
      ],
    });
    schema.turn = "Ton";
    schema.discard("A", schema.Ton.up[0]);

    const wildcard = schema.Nan.up.find((t) => eq(schema.tiles[t], W("Nan")));
    const player = { ...schema.Nan, up: [...schema.Nan.up, schema.discarded] };
    const partner = Schema.eyePartner(schema, player, schema.discarded);

    assert.ok(
      eq(schema.tiles[partner], T("Sou", 5)),
      "a spare 5索 pairs the claim, not the wildcard",
    );

    const claimed = schema.discarded;
    const message = schema.eyes("Nan", false);
    assert.deepEqual(message.body.eyes, [partner, claimed], "5索 + 5索 is what gets melded");
    assert.ok(
      schema.Nan.up.includes(wildcard),
      "the wildcard stays in hand rather than being spent on the pair",
    );
  });

  // The other half of the rule: the pair has to be the *claimed* tile. Dropping
  // two tiles that merely match, and leaving the claimed one among the melds,
  // would let a hand that only wins on a run through as an eyes claim.
  test("a hand that wins on a run is still not an eyes claim", () => {
    const { schema, seat } = table();
    schema.wildcard = W("Nan");
    seat("Ton", "A", { up: [T("Sou", 2)] });
    seat("Nan", "B", {
      up: [
        T("Sou", 1), T("Sou", 3), // Sou2 completes this run, it is not the pair
        T("Sou", 4), T("Sou", 5), T("Sou", 6),
        T("Sou", 7), T("Sou", 8),
        W("Nan"), // fills in for Sou9
        T("Pin", 5), T("Pin", 5), // the real pair
      ],
    });
    schema.turn = "Ton";
    schema.discard("A", schema.Ton.up[0]);

    const claimant = { ...schema.Nan, up: [...schema.Nan.up, schema.discarded] };
    assert.equal(Schema.winningHand(schema, claimant), true, "the hand does win");
    assert.equal(
      Schema.winningHand(schema, claimant, schema.discarded),
      false,
      "but not by pairing the discard, so eyes must still be refused",
    );
  });
});

describe("claiming a discard to complete 七对", () => {
  // Six pairs and a lone Man7, with Ton throwing the Man7. Deliberately a shape
  // where the discard could also be chowed (5/6 and 6/8 are both in hand) --
  // that is the ordinary look of a numbered seven-pair hand, and it is what made
  // the in-turn player, the only seat offered 吃, unable to take the win.
  function sevenPairsClaim() {
    const { schema, seat } = table();
    schema.wildcard = T("Pin", 9); // held by nobody, so no wildcard help
    seat("Ton", "A", { up: [T("Man", 7)] });
    seat("Nan", "B", {
      up: [
        T("Man", 1), T("Man", 1),
        T("Man", 2), T("Man", 2),
        T("Man", 3), T("Man", 3),
        T("Man", 5), T("Man", 5),
        T("Man", 6), T("Man", 6),
        T("Man", 8), T("Man", 8),
        T("Man", 7),
      ],
    });
    schema.turn = "Ton";
    schema.discard("A", schema.Ton.up[0]);
    return schema;
  }

  test("the discard completing seven pairs is a valid eyes claim", () => {
    const schema = sevenPairsClaim();
    const claimant = { ...schema.Nan, up: [...schema.Nan.up, schema.discarded] };
    // The eye-constrained call is what gates the client's 胡 button; seven pairs
    // has to satisfy it even though the discard is not being used as the eye of
    // a melded hand.
    assert.equal(
      Schema.winningHand(schema, claimant, schema.discarded),
      true,
      "七对 must be claimable on the discard that completes it",
    );
  });

  // `eyes()` finishes the game on its own: completes it, scores it, and returns
  // the win message. The vote handler used to run the generic win step after it
  // as well, which asked `winningHand` about the 12 tiles left once the pair had
  // moved into `down` -- never a winning shape. A claim that had already gone
  // through came back as "You do not have a valid winning hand", and only that
  // throw stopped the round being scored a second time.
  test("eyes() completes and scores the round by itself", () => {
    const schema = sevenPairsClaim();
    const message = schema.eyes("Nan", false);

    assert.equal(message.subject, "win");
    assert.equal(message.body.position, "Nan");
    assert.equal(schema.completed, true);
    assert.ok(schema.scores.B > 0, "the claimant is paid");
    assert.equal(schema.scores.A, -schema.scores.B, "and the discarder pays");

    assert.equal(
      Schema.winningHand(schema, schema.Nan),
      false,
      "what is left cannot be re-checked as a win, so the generic step must not run",
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

  // The same rule, on a win claimed from a discard rather than self-drawn.
  //
  // `eyes()` records the claimed pair as a two-tile group in `down`, which
  // leaves `up` one short of the 3n+2 shape `winningHand` will even look at. The
  // face-value re-check therefore answered "no" for every win claimed on a
  // discard, whatever the wildcards were actually doing, so 无癞子 was never
  // awarded on one.
  //
  // 南南南 here is a plain triplet -- the hand does not lean on the wildcard at
  // all -- so it has to score exactly as it would with no wildcard in sight.
  function claimedTripleSouth() {
    const { schema, seat } = table();
    schema.wildcard = W("Nan");
    seat("Ton", "A", { up: [T("Sou", 5)] });
    seat("Nan", "B", {
      up: [
        W("Nan"), W("Nan"), W("Nan"),
        T("Man", 1), T("Man", 2), T("Man", 3),
        T("Man", 7), T("Man", 8), T("Man", 9),
        T("Sou", 5),
      ],
    });
    schema.turn = "Ton";
    schema.discard("A", schema.Ton.up[0]);
    schema.eyes("Nan", false);
    return schema;
  }

  test("a wildcard at face value counts as wildcard-free on a claimed win too", () => {
    const held = claimedTripleSouth();
    const withWildcardHeld = held.computeRoundScore("Nan").calcLoserScore(false, true, 0);

    // The same hand scored as though that tile were never the wildcard.
    const baseline = claimedTripleSouth();
    baseline.wildcard = T("Pin", 9); // held by nobody
    const withNoWildcardAtAll = baseline
      .computeRoundScore("Nan")
      .calcLoserScore(false, true, 0);

    assert.equal(
      withWildcardHeld,
      withNoWildcardAtAll,
      "holding the wildcard but not relying on it keeps the 无癞子 doubling",
    );
  });

  test("a wildcard actually standing in for a tile does not get the doubling", () => {
    const { schema, seat } = table();
    schema.wildcard = W("Nan");
    seat("Ton", "A", { up: [T("Sou", 8)] });
    seat("Nan", "B", {
      up: [
        T("Man", 1), T("Man", 2), T("Man", 3),
        T("Sou", 7), T("Sou", 7), T("Sou", 7),
        T("Sou", 8),
        W("Nan"), // filling in for a third 東
        W("Ton"), W("Ton"),
      ],
      down: [[T("Man", 6), T("Man", 7), T("Man", 8)]],
    });
    schema.turn = "Ton";
    schema.discard("A", schema.Ton.up[0]);
    schema.eyes("Nan", false);

    const leaning = schema.computeRoundScore("Nan").calcLoserScore(false, true, 0);
    schema.wildcard = T("Pin", 9);
    const asIfWildcardFree = schema
      .computeRoundScore("Nan")
      .calcLoserScore(false, true, 0);

    assert.ok(
      leaning < asIfWildcardFree,
      `a hand leaning on the wildcard scores below the wildcard-free version ` +
        `(${leaning} vs ${asIfWildcardFree})`,
    );
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

  // 杠上开花: won on the replacement tile a kong drew. Only a kong replaces from
  // the back of the wall, so "back" is the flower and "front" is an ordinary
  // self-draw -- the two differ in nothing else, which is what makes them worth
  // comparing directly.
  test("winning on a kong's replacement tile is worth ten over an ordinary self-draw", () => {
    const bloom = sevenPairsWin();
    bloom.source = "back";
    const withBloom = bloom.computeRoundScore("Ton").calcLoserScore(false, false, 0);

    const plain = sevenPairsWin();
    plain.source = "front";
    const withoutBloom = plain.computeRoundScore("Ton").calcLoserScore(false, false, 0);

    assert.ok(withBloom > withoutBloom, "the flower on the kong is worth more");

    // The ten lands before the doublings, so the flat difference depends on the
    // hand. Rather than restate the multipliers here -- which would be this
    // scoring function written out a second time, and that has bitten already --
    // measure it against 海底捞, the other bonus of ten added at the same point.
    // The two must come out identical.
    const lastLap = sevenPairsWin();
    lastLap.source = "front";
    lastLap.finalDraw = true;
    const withFinalDraw = lastLap.computeRoundScore("Ton").calcLoserScore(false, false, 0);

    assert.equal(
      withBloom,
      withFinalDraw,
      "杠上开花 is worth exactly what 海底捞 is worth, both being ten before the multipliers",
    );
  });
});
