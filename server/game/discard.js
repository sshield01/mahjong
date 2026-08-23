import { autoPlayAfterDiscard } from "./autoplay.js";

export default async function discard(socket, schema, { tile }) {
  socket.emit(schema.discard(socket.name, tile));
  // A disconnected player's vote is normally cast for them by `cast()`, but that
  // only runs once some *connected* player votes. The discarder never votes on
  // their own tile, so when every remaining voter is disconnected -- a two player
  // game where the opponent dropped, say -- nothing would resolve the round and
  // the game would sit there forever. Step it forward on their behalf.
  autoPlayAfterDiscard(socket, schema);
}
