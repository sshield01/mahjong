import { eq } from "../lib/schema.js";

export const WILDCARD_WARNING =
  "确定吗？手中有两张或以上百搭，可能无法胡正常牌型。";

// Is this seat about to spend something a regular 胡 still depends on?
//
// Holding two or more wildcards, a win needs the hand to stay concealed, be all
// one suit, or have the wildcards declared. Melding -- 吃, 碰, 杠 -- spends the
// concealment, so a player can quietly close off the win they were holding
// without ever being told. That is what the prompt is for.
//
// Only while the hand still is concealed. Once a meld is down the choice has
// already been made, and asking again on every later claim is nagging about a
// door that is shut.
//
// Never for 胡. Every 胡 the table offers was built by asking `winningHand`
// about the hand the claim actually produces, and that question applies the
// two-wildcard rule itself -- so a 胡 on screen is a win the server will accept.
// Warning that a hand may be spoiled while the player is in the act of winning
// with it is nonsense, and it fired most reliably on the hands in the best
// health: a concealed win is exactly the shape the rule exempts.
export function spendsWildcardWin(schema, myWind) {
  if (!myWind || !schema || !schema.wildcard) return false;
  if (!schema[myWind]) return false;
  if (schema[myWind].down.length > 0) return false;
  const wildcards = schema[myWind].up.filter(
    (tile) => eq(schema.tiles[tile], schema.wildcard),
  ).length;
  return wildcards >= 2;
}

// The prompt itself, kept beside the rule so the two cannot drift. `confirm`
// comes from the game context -- the styled in-app dialog, not the browser one.
//
// Shared because this lived in two components with the same body and the same
// explanation, and the last time 胡 was lifted out of it only one of the two
// copies was found. There is nothing here worth having twice.
export function confirmWildcards(confirm, schema, myWind) {
  if (!spendsWildcardWin(schema, myWind)) return true;
  return confirm(WILDCARD_WARNING);
}
