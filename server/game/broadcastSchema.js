import sockets from "./sockets.js";
import Schema, { WINDS } from "../lib/schema.js";

// Push a personalised view of `schema` to everyone in its room at once: each
// seated player sees their own hand and nobody else's, spectators see no hand at
// all. Used whenever the whole table has to jump to a new schema together --
// starting a game, or moving on to the next one.
export default function broadcastSchema(schema, { spectatorsOnly = false, subject = "start" } = {}) {
  const seated = new Set(
    WINDS.filter((position) => schema[position]).map((position) => schema[position].name),
  );

  // `spectatorsOnly` is for the moment a next game is created: seated players
  // move themselves across as they each click 再来一局, and pushing to them would
  // rip the scoreboard away before they had finished reading it.
  if (!spectatorsOnly) {
    for (const name of seated) {
      const target = sockets.get(name);
      // A seated player can be disconnected mid-lobby; their socket is already
      // gone from the registry, so skip rather than throwing on `undefined.send`.
      if (target) target.send(subject, Schema.concealed(schema, name));
    }
  }

  // Spectators hold no seat, so the loop above never reaches them. Without this
  // they would never learn the game moved on and would sit on a stale view.
  for (const [viewerName, viewerSocket] of sockets) {
    if (seated.has(viewerName)) continue;
    if (viewerSocket.game !== schema.name) continue;
    viewerSocket.send(subject, Schema.concealed(schema, viewerName));
  }
}
