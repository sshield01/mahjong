import Message from "../socket/message.js";
import Schema, { WINDS } from "../lib/schema.js";
import { markConnected, isAbsent, autoPlayAfterDraw } from "./autoplay.js";
import { castIgnoreForPlayer } from "./votes.js";
import transferHostIfAway from "./hostTransfer.js";

export default async function returnSeat(socket, schema) {
  const position = schema.seatOf(socket.name);
  if (!position) {
    throw new Error("You are not seated.");
  }

  markConnected(socket.name);
  socket.emit(new Message("playerConnected", { name: socket.name }));
  // If the host is away and this player is back, the role can land here.
  transferHostIfAway(socket, schema);

  // Tiles drawn on their behalf while away were never revealed to them, so their
  // local view has holes in it. Hand back a fresh private view rather than trying
  // to replay what they missed.
  socket.send("start", Schema.concealed(schema, socket.name));

  // The game may have stalled because nobodyPresent() was true when the last
  // absent player's turn came up. Now that someone is back, kick auto-play for
  // any still-absent seat that is blocking the table.
  resumeAutoPlay(socket, schema);
}

function resumeAutoPlay(socket, schema) {
  if (!schema.started || schema.completed) return;
  const turnPlayer = schema[schema.turn];
  if (turnPlayer && isAbsent(turnPlayer.name)) {
    if (schema.drawn !== undefined) {
      autoPlayAfterDraw(socket, schema);
    } else if (schema.discarded === undefined) {
      try {
        const [message] = schema.draw(schema.turn);
        socket.emit(message);
        autoPlayAfterDraw(socket, schema);
      } catch (e) {}
    }
  }
  if (schema.discarded !== undefined) {
    for (const wind of WINDS) {
      if (schema[wind] && schema.previousTurn !== wind && isAbsent(schema[wind].name)) {
        castIgnoreForPlayer(socket, schema, wind);
      }
    }
  }
}
