import sockets from "./sockets.js";
import Message from "../socket/message.js";
import Schema from "../lib/schema.js";
import { isDisconnected, markConnected } from "./autoplay.js";
import transferHostIfAway from "./hostTransfer.js";

// Taking back a seat you were already playing. The session token in localStorage
// handles the ordinary case (a refresh), but a player coming back on a different
// device -- or after clearing storage -- has no token and would otherwise be
// stuck spectating a game their own name is still sitting in.
//
// The name is the only identity this game has (the same basis on which `takeSeat`
// hands out a seat in the first place), so matching it is what proves the claim.
export default async function reclaimSeat(socket, schema, { name }) {
  const desired = String(name || "").trim();
  if (!desired) {
    throw new Error("Please enter a name.");
  }

  const seat = schema.seatOf(desired);
  if (!seat) {
    throw new Error(`Nobody called ${desired} is sitting at this table.`);
  }
  if (!isDisconnected(desired)) {
    throw new Error(`${desired} is still connected.`);
  }

  const existing = sockets.get(desired);
  if (existing && existing !== socket && existing.raw.connected) {
    throw new Error(`${desired} is already connected.`);
  }
  if (existing && existing !== socket) {
    sockets.delete(desired);
  }

  sockets.delete(socket.name);
  socket.identify(desired);
  sockets.set(desired, socket);
  markConnected(desired);

  socket.broadcast(new Message("playerConnected", { name: desired }));
  // Someone is present again -- if the host is still away, they can take over.
  transferHostIfAway(socket, schema);
  // Hand them the seat's full private view -- their tiles, which as a spectator
  // they were never sent. The client treats "start" as "replace your world".
  socket.send("start", Schema.concealed(schema, desired));

  return { name: desired, position: seat };
}
