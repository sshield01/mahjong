import broadcastSchema from "./broadcastSchema.js";

const MINIMUM_PLAYERS = 2;

export default async function startGame(socket, schema) {
  schema.assertStarted(false);
  if (schema.host && schema.host !== socket.name) {
    throw new Error("Only the host can start the game.");
  }
  if (schema.seatedPlayers().length < MINIMUM_PLAYERS) {
    throw new Error(`At least ${MINIMUM_PLAYERS} players are needed to start.`);
  }
  schema.start();
  broadcastSchema(schema);
}
