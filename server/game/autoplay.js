import { WINDS, eq } from "../lib/schema.js";
import { castIgnoreForPlayer } from "./votes.js";
import playFinalRound from "./finalRound.js";
import sockets from "./sockets.js";

const disconnected = new Set();

export function markDisconnected(name) {
  disconnected.add(name);
}

export function markConnected(name) {
  disconnected.delete(name);
}

export function isDisconnected(name) {
  return disconnected.has(name);
}

// Is this seat unattended? Someone on 暂离 is flagged above but still holding a
// live socket; someone whose tab is gone has no socket at all.
//
// The flag alone is not enough, because it lives in memory and dies with the
// process. Rooms are written to disk, so restarting the server -- a rebuild, a
// redeploy -- brings a room back with its seats still held by name and nobody
// marked away. The server then believed everyone was still sitting there: seats
// could not be reclaimed or cleared, and nothing auto-played for them. Reusing
// the room code locked everybody out of it for good. A name with no live socket
// behind it is unattended whatever the flag says.
export function isAbsent(name) {
  if (disconnected.has(name)) return true;
  const socket = sockets.get(name);
  return !socket || !socket.raw || !socket.raw.connected;
}

// Auto-play is there so one absent player does not block everyone else. With
// every seat away there is nobody left to unblock, and the chain
// draw -> discard -> draw has nothing to pace it: two players stepping away for
// a minute used to come back to a hand that had played itself out to the last
// tile of the wall, unfinishable and unrestartable. Hold the game where it
// stands instead and let it resume when somebody comes back.
const nobodyPresent = (schema) =>
  schema.activePlayers().every((player) => isAbsent(player.name));

// Somebody is back at a table that stopped moving. Parking the hand is the right
// thing to do while every seat is away, but nothing looked at the position again
// afterwards: the absent turn player's auto-play had been abandoned and was never
// retried, so the table stayed frozen even once a player returned. Every "someone
// is back" path calls this to re-examine where the hand stands and get it going.
//
// The guard matters as much as the kick. This also runs from the connection
// handshake, which fires for arrivals that never take a seat -- a spectator, or
// anyone opening the room from the front page -- and those leave every seat as
// absent as it was. Without the check each such connection pulled another tile
// for a player who is not there: the same runaway `nobodyPresent` exists to stop,
// merely paced by page loads instead of by the wall.
export function resumeAutoPlay(socket, schema) {
  if (!schema.started || schema.completed) return;
  if (nobodyPresent(schema)) return;

  const turnPlayer = schema[schema.turn];
  if (turnPlayer && isAbsent(turnPlayer.name)) {
    if (schema.drawn !== undefined) {
      autoPlayAfterDraw(socket, schema);
    } else if (schema.discarded === undefined) {
      try {
        const [drawMessage] = schema.draw(schema.turn);
        socket.emit(drawMessage);
        autoPlayAfterDraw(socket, schema);
      } catch (e) {
        // Wall exhausted -- nothing left to resume.
      }
    }
  }

  // A discard still on the table waits on every seat that has not answered, and
  // an absent one never will by itself.
  if (schema.discarded !== undefined) {
    for (const wind of WINDS) {
      if (schema[wind] && !schema[wind].waiting && schema.previousTurn !== wind && isAbsent(schema[wind].name)) {
        castIgnoreForPlayer(socket, schema, wind);
      }
    }
  }
}

export function autoPlayAfterDraw(socket, schema) {
  const position = schema.turn;
  const player = schema[position];
  if (!player || !isAbsent(player.name)) return;
  if (schema.drawn === undefined) return;
  if (schema.completed) return;
  if (nobodyPresent(schema)) return;

  const tile = pickDiscard(schema, position);
  if (tile === null) return;

  const message = schema.discard(player.name, tile);
  socket.emit(message);
  autoPlayAfterDiscard(socket, schema);
}

export function autoPlayAfterDiscard(socket, schema) {
  if (schema.completed) return;
  if (nobodyPresent(schema)) return;

  const voters = WINDS.filter(
    (wind) => schema[wind] && !schema[wind].waiting && schema.previousTurn !== wind,
  );
  const allDisconnected = voters.every((wind) => isAbsent(schema[wind].name));
  if (!allDisconnected) return;

  const nextTurn = schema.turn;
  const nextPlayer = schema[nextTurn];
  if (!nextPlayer || !isAbsent(nextPlayer.name)) return;

  // Down to the last lap: the 海底 round finishes the hand by itself.
  if (playFinalRound(socket, schema)) return;

  try {
    const [drawMessage, reveal] = schema.draw(nextTurn);
    socket.emit(drawMessage);
    autoPlayAfterDraw(socket, schema);
  } catch (e) {
    // Wall exhausted — game ends in a draw
  }
}

function pickDiscard(schema, position) {
  const hand = schema[position].up;
  const drawn = schema.drawn;
  if (drawn !== undefined && !isWildcard(schema, drawn)) {
    return drawn;
  }
  for (const tile of hand) {
    if (!isWildcard(schema, tile)) {
      return tile;
    }
  }
  return null;
}

function isWildcard(schema, tileIndex) {
  return schema.wildcard && eq(schema.tiles[tileIndex], schema.wildcard);
}
