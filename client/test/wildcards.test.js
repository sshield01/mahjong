import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spendsWildcardWin, confirmWildcards, WILDCARD_WARNING } from "../src/game/wildcards.js";

const P = (value) => ({ suit: "Pin", value });
const NAN = { suit: "wind", value: "Nan" };

function hand({ tiles, up, down = [], wildcard = NAN, seat = "Nan" }) {
  return { tiles, wildcard, [seat]: { up, down } };
}

describe("warning before a meld spends a wildcard win", () => {
  // Two wildcards and a regular 胡 needs the hand concealed, all one suit, or the
  // wildcards declared. Melding spends the concealment, and nothing else on
  // screen says so -- which is the entire reason this prompt exists.
  test("two wildcards in a concealed hand is worth warning about", () => {
    const schema = hand({ tiles: [NAN, NAN, P(3)], up: [0, 1, 2] });
    assert.equal(spendsWildcardWin(schema, "Nan"), true);
  });

  test("one wildcard is not", () => {
    const schema = hand({ tiles: [NAN, P(3), P(4)], up: [0, 1, 2] });
    assert.equal(spendsWildcardWin(schema, "Nan"), false);
  });

  // Once a meld is down the concealment is already gone. Asking again on every
  // later claim is nagging about a door that is shut.
  test("a hand that has already melded is past warning", () => {
    const schema = hand({ tiles: [NAN, NAN, P(3)], up: [0, 1], down: [[2]] });
    assert.equal(spendsWildcardWin(schema, "Nan"), false);
  });

  // `null`, not `undefined` -- the helper's default parameter would swallow the
  // latter and quietly hand back a table that does have a wildcard.
  test("a table with no wildcard at all never warns", () => {
    const schema = hand({ tiles: [NAN, NAN], up: [0, 1], wildcard: null });
    assert.equal(spendsWildcardWin(schema, "Nan"), false);
  });

  test("a spectator has no hand to spend", () => {
    const schema = hand({ tiles: [NAN, NAN], up: [0, 1] });
    assert.equal(spendsWildcardWin(schema, undefined), false);
    assert.equal(spendsWildcardWin(schema, "Shaa"), false, "nor does an empty seat");
  });

  test("the prompt is only reached when the rule says so", () => {
    const asked = [];
    const confirm = (text) => (asked.push(text), false);

    const safe = hand({ tiles: [NAN, P(3), P(4)], up: [0, 1, 2] });
    assert.equal(confirmWildcards(confirm, safe, "Nan"), true, "no rule, no prompt");
    assert.deepEqual(asked, [], "and the player is not interrupted");

    const risky = hand({ tiles: [NAN, NAN, P(3)], up: [0, 1, 2] });
    assert.equal(confirmWildcards(confirm, risky, "Nan"), false, "declining stops the action");
    assert.deepEqual(asked, [WILDCARD_WARNING]);
  });
});
