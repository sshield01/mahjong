import sockets from "./sockets.js";
import transferHostIfAway from "./hostTransfer.js";
import { markConnected } from "./autoplay.js";

const MAX_NAME_LENGTH = 20;

export default async function takeSeat(socket, schema, { position, name }) {
  const desired = String(name || "").trim();
  if (!desired) {
    throw new Error("Please enter a name.");
  }
  if (desired.length > MAX_NAME_LENGTH) {
    throw new Error(`Names are limited to ${MAX_NAME_LENGTH} characters.`);
  }

  // Same staleness test the old `identification` step used: a registered socket
  // that has already dropped doesn't reserve the name.
  const existing = sockets.get(desired);
  if (existing && existing !== socket) {
    if (existing.raw.connected) {
      throw new Error(`The name ${desired} is already in use.`);
    }
    sockets.delete(desired);
  }

  // Validate the seat before touching any identity state: `addPlayer` throws if
  // the game has started, the position isn't a real seat, it's already taken, or
  // this name is seated elsewhere. Doing it first means a rejected claim can
  // never leave the socket half-renamed.
  const message = schema.addPlayer(desired, position);

  sockets.delete(socket.name);
  socket.identify(desired);
  sockets.set(desired, socket);
  // Away-ness is tracked by bare name, so a name that dropped out of some other
  // game could still be flagged. Sitting down means present, full stop --
  // without this the player is auto-played from their very first turn.
  markConnected(desired);

  socket.emit(message);
  // A table whose host is away has nobody able to deal; this new arrival can.
  transferHostIfAway(socket, schema);
  return { name: desired, position };
}
