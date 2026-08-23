import Message from "../socket/message.js";
import { markDisconnected, autoPlayAfterDraw } from "./autoplay.js";
import { castIgnoreForPlayer } from "./votes.js";
import transferHostIfAway from "./hostTransfer.js";

// Stepping away on purpose. The seat is kept and auto-played exactly as if the
// connection had dropped -- the same "away" flag drives both -- except the player
// stays in the room watching and can come back whenever they like.
export default async function leaveSeat(socket, schema) {
  const position = schema.seatOf(socket.name);
  if (!position) {
    throw new Error("You are not seated.");
  }

  markDisconnected(socket.name);
  socket.emit(new Message("playerDisconnected", { name: socket.name }));
  // Don't take the start button away with you.
  transferHostIfAway(socket, schema);

  // If the table is waiting on this player right now, get it moving rather than
  // leaving everyone staring at a seat that has just gone quiet.
  if (schema.started && !schema.completed) {
    if (schema.turn === position && schema.drawn !== undefined) {
      autoPlayAfterDraw(socket, schema);
    } else if (
      schema.turn === position &&
      schema.drawn === undefined &&
      schema.discarded === undefined
    ) {
      try {
        const [message] = schema.draw(position);
        socket.emit(message);
        autoPlayAfterDraw(socket, schema);
      } catch (e) {
        // Wall exhausted -- nothing to draw, leave the game as it stands.
      }
    } else if (schema.discarded !== undefined) {
      castIgnoreForPlayer(socket, schema, position);
    }
  }
}
