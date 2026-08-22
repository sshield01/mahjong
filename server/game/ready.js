import sockets from "./sockets.js";
import Schema, { WINDS } from "../lib/schema.js";

export default async function ready(socket, schema, { ready }) {
  const message = schema.readyPlayer(socket.name, ready);
  if (message) {
    socket.emit(message);
  } else {
    const seatedNames = new Set(
      WINDS.filter((position) => schema[position]).map((position) => schema[position].name),
    );
    for (const position of WINDS) {
      if (!schema[position]) continue;
      sockets
        .get(schema[position].name)
        .send("start", Schema.concealed(schema, schema[position].name));
    }
    // Spectators aren't seated in any WINDS slot, so the loop above never reaches
    // them -- without this they'd never learn the game started and would stay
    // stuck on the pre-game lobby view. Every spectator gets the same view (no
    // hand of their own to reveal), so there's no per-viewer personalization to
    // worry about here, unlike the seated broadcast above.
    for (const [viewerName, viewerSocket] of sockets) {
      if (seatedNames.has(viewerName)) continue;
      if (viewerSocket.game !== schema.name) continue;
      viewerSocket.send("start", Schema.concealed(schema, viewerName));
    }
  }
}
