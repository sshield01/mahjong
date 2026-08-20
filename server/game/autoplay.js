import { WINDS, eq } from "../lib/schema.js";
import { castIgnoreForPlayer } from "./votes.js";

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

export function autoPlayAfterDraw(socket, schema) {
  const position = schema.turn;
  const player = schema[position];
  if (!player || !isDisconnected(player.name)) return;
  if (schema.drawn === undefined) return;
  if (schema.completed) return;

  const tile = pickDiscard(schema, position);
  if (tile === null) return;

  const message = schema.discard(player.name, tile);
  socket.emit(message);
  autoPlayAfterDiscard(socket, schema);
}

export function autoPlayAfterDiscard(socket, schema) {
  if (schema.completed) return;

  const voters = WINDS.filter(
    (wind) => schema[wind] && schema.previousTurn !== wind,
  );
  const allDisconnected = voters.every((wind) => isDisconnected(schema[wind].name));
  if (!allDisconnected) return;

  const nextTurn = schema.turn;
  const nextPlayer = schema[nextTurn];
  if (!nextPlayer || !isDisconnected(nextPlayer.name)) return;

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
