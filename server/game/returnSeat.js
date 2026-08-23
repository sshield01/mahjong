import Message from "../socket/message.js";
import Schema from "../lib/schema.js";
import { markConnected } from "./autoplay.js";
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
}
