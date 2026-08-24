import { isAbsent, markConnected } from "./autoplay.js";
import transferHostIfAway from "./hostTransfer.js";

// Freeing a seat whose player never came back. Normally only between games:
// mid-hand their tiles are part of the wall's accounting, so a seat cannot
// simply vanish.
export default async function kickPlayer(socket, schema, { position }) {
  if (schema.host && schema.host !== socket.name) {
    throw new Error("Only the host can remove a player.");
  }

  const player = schema[position];
  if (!player) {
    throw new Error("That seat is already empty.");
  }
  // The exception is a chair only reserved for the next hand. It holds no tiles
  // and no turn, so letting it go costs the hand nothing -- whereas refusing
  // meant somebody could sit down mid-hand, vanish, and leave a seat nobody
  // could free until the deal was over.
  if (!player.waiting) {
    schema.assertStarted(false);
  }
  if (player.name === socket.name) {
    throw new Error("You cannot remove yourself.");
  }
  if (!isAbsent(player.name)) {
    throw new Error(`${player.name} is still here.`);
  }

  const name = player.name;
  socket.emit(schema.removePlayer(name));
  // They hold no seat now, so stop tracking them as an absent player.
  markConnected(name);
  // `removePlayer` hands the host role to the first remaining seat, which may
  // itself be someone who is away -- make sure it lands on a present player.
  transferHostIfAway(socket, schema);
  return { name, position };
}
