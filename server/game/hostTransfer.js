import Message from "../socket/message.js";
import { isAbsent } from "./autoplay.js";

// The host owns the start button, so a host who drops or steps away would leave
// the table unable to deal another hand. Hand the role to someone who is actually
// present. Called wherever the set of present players changes -- someone leaving,
// and equally someone arriving, since the seat that can take over may be the one
// that just filled.
export default function transferHostIfAway(socket, schema) {
  if (!schema.host || !isAbsent(schema.host)) return false;

  const heir = schema
    .seatedPlayers()
    .find((player) => !isAbsent(player.name));
  if (!heir || heir.name === schema.host) return false;

  schema.host = heir.name;
  socket.emit(new Message("hostChanged", { host: schema.host }));
  return true;
}
