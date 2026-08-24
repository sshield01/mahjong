import sockets from "./sockets.js";
import Message from "../socket/message.js";
import Schema from "../lib/schema.js";
import { markConnected, resumeAutoPlay } from "./autoplay.js";
import transferHostIfAway from "./hostTransfer.js";

// Taking back a seat you were already playing. The session token in sessionStorage
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
  // A live socket holding the name is the only thing that should refuse this.
  // Gating on the away flag instead locked a room out of itself after a restart:
  // rooms are written to disk but the flag is not, so the seats came back held
  // by name with nobody marked away, and the server insisted everyone was still
  // sitting there.
  const existing = sockets.get(desired);
  if (existing && existing !== socket && existing.raw.connected) {
    throw new Error(`${desired} is still at the table.`);
  }
  if (existing && existing !== socket) {
    sockets.delete(desired);
  }

  sockets.delete(socket.name);
  socket.identify(desired);
  sockets.set(desired, socket);
  markConnected(desired);

  // `emit`, not `broadcast`: the player coming back has to hear this too. They
  // arrived as a spectator and were handed the away list on joining, which had
  // their own name on it -- the very reason the seat was reclaimable. Telling
  // only the rest of the room left them looking at their own seat marked 断线,
  // with a 我回来了 button and "系统代打" over a hand they were in fact playing
  // normally. `leaveSeat` and `returnSeat` both emit their side of this for the
  // same reason.
  socket.emit(new Message("playerConnected", { name: desired }));
  // Someone is present again -- if the host is still away, they can take over.
  transferHostIfAway(socket, schema);
  // Hand them the seat's full private view -- their tiles, which as a spectator
  // they were never sent. The client treats "start" as "replace your world".
  socket.send("start", Schema.concealed(schema, desired));

  // They may be walking back into a hand that was parked with every seat away.
  resumeAutoPlay(socket, schema);

  return { name: desired, position: seat };
}
