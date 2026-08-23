import Schema from "../lib/schema.js";
import sockets from "./sockets.js";

// The 海底 round. Once the wall is down to the dead wall plus one tile per seat,
// each player in turn takes a single tile and keeps it -- nobody discards, so
// nothing can be claimed and there is nothing to vote on. Win on the tile you
// just drew and it is 海底捞, worth an extra 10. Get all the way round with
// nobody out and the hand is 黄庄: the dealer takes a default win and everyone
// else pays them two.
//
// It plays out in one go rather than waiting on anyone. There is no decision to
// make -- you cannot discard, and a win here always beats paying for 黄庄 -- and
// a round that needs no input cannot stall waiting for a player who has gone.
export default function playFinalRound(socket, schema) {
  if (schema.completed || !schema.started) return false;
  if (!schema.finalRound()) return false;

  const laps = schema.seatedPlayers().length;
  for (let i = 0; i < laps; i++) {
    // Whatever the previous player drew stays in their hand; it is simply no
    // longer the tile of the moment.
    delete schema.drawn;

    const position = schema.turn;
    let message, reveal;
    try {
      [message, reveal] = schema.draw(position);
    } catch (error) {
      break; // nothing left to draw
    }

    // Everyone watches the draw; only its owner is told what it was.
    const owner = sockets.get(schema[position].name);
    if (owner && owner.raw.connected) {
      owner.broadcast(message);
      owner.send(message.subject, { ...message.body, reveal });
    } else {
      socket.emit(message);
    }

    if (Schema.winningHand(schema, schema[position])) {
      schema.finalDraw = true;
      socket.emit(schema.win(schema[position].name));
      return true;
    }

    schema.nextTurn();
  }

  socket.emit(schema.washOut());
  return true;
}
