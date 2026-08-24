import AsyncSocket, { Disconnect } from "../socket/socket.js";
import Message from "../socket/message.js";
import Schema, { WINDS } from "../lib/schema.js";
import Fs from "fs";
import Crypto from "crypto";
import sockets from "./sockets.js";
import * as handlers from "./handlers.js";
import broadcastSchema from "./broadcastSchema.js";
import transferHostIfAway from "./hostTransfer.js";
import { emitCurrentVotes, castIgnoreForPlayer } from "./votes.js";
import { markDisconnected, markConnected, isAbsent, autoPlayAfterDraw } from "./autoplay.js";

const games = new Map();
const playersInGame = new WeakMap();
const sessions = new Map();

// How long a room nobody is in is kept before the server forgets it.
export const ROOM_TTL_HOURS = Number(process.env.mahjong_room_ttl_hours || 24);
const SWEEP_EVERY = 60 * 60 * 1000;

// What of a room's history is worth writing down. Every 再来一局 appends another
// whole game, and all of them used to be saved -- five rounds at one table came
// to twice the bytes of one, and it kept growing all evening. Only two are ever
// read again: the first, whose dealer fixes the prevailing-wind rotation, and
// the one being played.
function roomHistory(schemas) {
  if (schemas.length <= 2) return schemas;
  return [schemas[0], schemas[schemas.length - 1]];
}

// Rooms are written out when the last player leaves, and nothing removed them
// again -- every room code anyone had ever opened stayed on disk for good. Age
// is counted from the last write, which is the last time anybody was in there.
export async function sweepRooms(
  stateDirectory,
  ttlMs = ROOM_TTL_HOURS * 60 * 60 * 1000,
  isLive = () => false,
) {
  if (!stateDirectory || !(ttlMs > 0)) return [];
  let entries;
  try {
    entries = await Fs.promises.readdir(stateDirectory);
  } catch (error) {
    return []; // no state directory yet
  }
  const cutoff = Date.now() - ttlMs;
  const forgotten = [];
  for (const entry of entries) {
    if (isLive(entry)) continue; // somebody is in it right now
    try {
      const path = `${stateDirectory}/${entry}`;
      const stat = await Fs.promises.stat(path);
      if (!stat.isFile() || stat.mtimeMs >= cutoff) continue;
      await Fs.promises.unlink(path);
      forgotten.push(entry);
    } catch (error) {
      // Raced with something else, or not ours to remove.
    }
  }
  if (forgotten.length) {
    console.log(`Forgot ${forgotten.length} idle room(s): ${forgotten.join(", ")}`);
  }
  return forgotten;
}

export default (io, stateDirectory) => {
  const filename = (name) => `${stateDirectory}/${name}`;

  // Once at startup, then quietly in the background. Unreferenced so it never
  // holds the process open by itself.
  const sweep = () =>
    sweepRooms(stateDirectory, ROOM_TTL_HOURS * 60 * 60 * 1000, (room) =>
      games.has(room),
    );
  sweep();
  const sweeper = setInterval(sweep, SWEEP_EVERY);
  if (sweeper.unref) sweeper.unref();

  async function loadSchema(name) {
    if (games.has(name)) {
      return games.get(name);
    }

    const path = filename(name);
    let exists = true;
    try {
      await Fs.promises.access(path);
    } catch (e) {
      exists = false;
    }

    let data = { name };
    if (exists) {
      await Fs.promises.access(path, Fs.constants.R_OK);
      data = JSON.parse(await Fs.promises.readFile(path));
    }
    if (!Array.isArray(data)) {
      data = [data];
    }
    const schemas = data.map((data) => new Schema(data));
    games.set(name, schemas);
    playersInGame.set(schemas, 0);
    return schemas;
  }

  // One retryable loop instead of a fixed `reconnect` -> `identification` ->
  // `location` staging. Every failure replies and keeps listening, so a client
  // can retry any step; the old one-shot `socket.expect(...)` stages meant a
  // failed `reconnect` left the connection parked waiting for a message the
  // client would never send again.
  // Seats whose player has dropped. Sent on join so an arriving client knows
  // straight away which seats are up for grabs, and kept live afterwards by the
  // playerDisconnected / playerConnected broadcasts.
  const absentPlayers = (schema) =>
    schema.seatedPlayers().map((player) => player.name).filter(isAbsent);

  // Tables somebody is actually at, for the front page to list. Rooms sitting on
  // disk with nobody in them are left out: the point is to find a game to join,
  // and every room code ever used would bury the ones being played.
  const liveRooms = () =>
    [...games.entries()]
      .map(([room, schemas]) => {
        const schema = schemas[schemas.length - 1];
        return {
          room,
          people: playersInGame.get(schemas) || 0,
          playing: !!schema.started && !schema.completed,
          players: schema.seatedPlayers().map((player) => player.name),
          away: absentPlayers(schema),
        };
      })
      .filter((entry) => entry.people > 0)
      .sort((a, b) => b.players.length - a.players.length || a.room.localeCompare(b.room));

  async function handshake(socket) {
    for (;;) {
      const message = await socket.recv();

      if (message.subject === "reconnect") {
        const { token } = message.body || {};
        const session = token && sessions.get(token);
        if (!session) {
          message.fail("Session expired.");
          continue;
        }
        const { name, room } = session;
        if (sockets.has(name)) {
          const existing = sockets.get(name);
          if (!existing.raw.connected) {
            sockets.delete(name);
          } else {
            message.fail("Already connected.");
            continue;
          }
        }
        let schemas;
        try {
          schemas = await loadSchema(room);
        } catch (error) {
          message.fail("Room no longer exists.");
          sessions.delete(token);
          continue;
        }
        const schema = schemas[schemas.length - 1];
        // `name` may be a spectator with no seat -- that's fine, a valid session
        // token is enough to rejoin either way.
        socket.identify(name);
        sockets.set(name, socket);
        socket.join(room);
        markConnected(name);
        playersInGame.set(schemas, playersInGame.get(schemas) + 1);
        socket.broadcast(new Message("playerConnected", { name }));
        // Reconnecting makes this player available again; if the host is still
        // away the role can settle here rather than leaving the table stuck.
        transferHostIfAway(socket, schema);
        message.success({
          schema: Schema.concealed(schema, name),
          name,
          room,
          token,
          disconnected: absentPlayers(schema),
        });
        return { name, room, schemas, token };
      }

      if (message.subject === "location") {
        const room = (message.body || {}).room;
        if (!room) {
          message.fail("Required parameter `room` is missing.");
          continue;
        }

        let schemas, schema;
        try {
          schemas = await loadSchema(room);
          schema = schemas[schemas.length - 1];
        } catch (error) {
          message.fail(error.message || String(error));
          continue;
        }

        // Entering a room never asks who you are -- you arrive as an anonymous
        // spectator and pick up a real name by sitting down (`takeSeat`). The
        // placeholder only has to be unique, since `sockets` is keyed by it.
        const name = `guest-${Crypto.randomBytes(8).toString("hex")}`;
        const token = Crypto.randomBytes(16).toString("hex");
        sessions.set(token, { name, room });

        socket.identify(name);
        sockets.set(name, socket);
        socket.join(room);
        playersInGame.set(schemas, playersInGame.get(schemas) + 1);

        message.success({
          schema: Schema.concealed(schema, name),
          name,
          room,
          token,
          disconnected: absentPlayers(schema),
        });
        return { name, room, schemas, token };
      }

      // Answered before the connection has said who it is, because that is
      // exactly when it is asked: someone has opened the site with no room in
      // the URL and is looking for a table. It identifies nobody, so the loop
      // keeps waiting for a real handshake afterwards.
      if (message.subject === "rooms") {
        message.success({ rooms: liveRooms() });
        continue;
      }

      message.fail("Expected reconnect or location.");
    }
  }

  function resumeAutoPlay(socket, schema) {
    if (!schema.started || schema.completed) return;
    const turnPlayer = schema[schema.turn];
    if (turnPlayer && isAbsent(turnPlayer.name)) {
      if (schema.drawn !== undefined) {
        autoPlayAfterDraw(socket, schema);
      } else if (schema.discarded === undefined) {
        try {
          const [message] = schema.draw(schema.turn);
          socket.emit(message);
          autoPlayAfterDraw(socket, schema);
        } catch (e) {}
      }
    }
    if (schema.discarded !== undefined) {
      for (const wind of WINDS) {
        if (schema[wind] && schema.previousTurn !== wind && isAbsent(schema[wind].name)) {
          castIgnoreForPlayer(socket, schema, wind);
        }
      }
    }
  }

  return async (rawSocket) => {
    const socket = new AsyncSocket(rawSocket, io);
    let name, room, schemas, schema, token;
    try {
      ({ name, room, schemas, token } = await handshake(socket));
      let n = schemas.length - 1;
      schema = schemas[n];
      emitCurrentVotes(socket, schema);
      resumeAutoPlay(socket, schema);

      for (;;) {
        const message = await socket.recv();
        // Follow the room forward. A connection left pointing at a finished game
        // can only do harm: its votes land on a game nobody is playing, so the
        // live round waits forever for a player whose client has, as far as they
        // can tell, already answered. Two ways to end up there -- a spectator,
        // who has no 再来一局 button at all, and a seated player whose button
        // vanished because the host started the next game without waiting for
        // everyone to press it.
        //
        // `playAgain` is the exception: that message *is* the step forward, and
        // it needs to still see the finished game to know there is one to step
        // from.
        if (n < schemas.length - 1 && message.subject !== "playAgain") {
          n = schemas.length - 1;
          schema = schemas[n];
        }
        if (message.subject === "playAgain") {
          if (schema.completed) {
            ++n;
            if (schemas.length === n) {
              schemas.push(Schema.nextGame(schema, schemas[0]));
              // Spectators have no 再来一局 button of their own, so move them
              // across as soon as the next game exists. Seated players cross over
              // one at a time, as each of them asks for it.
              broadcastSchema(schemas[n], { spectatorsOnly: true });
            }
            schema = schemas[n];
          }
          message.success({ schema: Schema.concealed(schema, name) });

          // Asking for another game is also this player's vote to begin it. Once
          // everyone still seated has asked, deal immediately -- nobody has to go
          // back and press 开始. The host can still start early for a table that
          // is waiting on someone slow.
          //
          // `n > 0` keeps this to follow-up games only. Game one is started by
          // the host and nobody else, and without the guard a stray 再来一局 in
          // the opening lobby would count as a ready vote and could deal the
          // hand out from under them.
          const seat = schema.seatOf(name);
          if (n > 0 && seat && !schema.started) {
            schema[seat].ready = true;
            socket.emit(new Message("playerReady", { name }));
            const seated = schema.seatedPlayers();
            if (seated.length >= 2 && seated.every((player) => player.ready)) {
              schema.start();
              broadcastSchema(schema);
            }
          }
        } else {
          try {
            message.success(
              await handlers[message.subject](
                socket,
                schema,
                message.body || {},
              ),
            );
          } catch (error) {
            console.error(error);
            message.fail(error.message);
          }
          // `takeSeat` renames the socket from its guest placeholder to the name
          // the player typed. Everything below (disconnect autoplay, seat
          // cleanup, `sockets` removal) keys off these, so they have to follow.
          if (socket.name !== name) {
            name = socket.name;
            sessions.set(token, { name, room });
          }
        }
      }
    } catch (error) {
      if (error instanceof Disconnect) {
        if (name) {
          console.log(`${name} has left`);
          // Only players holding a seat are tracked as away. Spectators leave
          // nothing behind, and tracking their throwaway guest names would grow
          // this set without bound -- and, since it is keyed by bare name, could
          // wrongly mark a later player who happens to reuse one.
          if (schema && schema.seatOf(name)) {
            markDisconnected(name);
            // Tell the table the seat is now empty-but-held, so the others can
            // see it and the player can reclaim it when they get back.
            socket.emit(new Message("playerDisconnected", { name }));
            // If that was the host, the start button just left with them.
            transferHostIfAway(socket, schema);
          }
        }
        if (schema && schema.started && !schema.completed) {
          // A disconnecting spectator has no seat -- nothing to autoplay/ignore for.
          const position = schema.seatOf(name);
          if (position) {
            // Everything in here can throw -- resolving the round can end up
            // drawing from a wall with nothing left in it, say. There is no
            // message to fail here, this runs on the way out of a closed socket,
            // and an escaping error takes the whole process down with it: every
            // room in memory lost because one player closed a tab. Keep the
            // table's state as it stands and let the disconnect finish.
            try {
              if (schema.turn === position && schema.drawn !== undefined) {
                autoPlayAfterDraw(socket, schema);
              } else if (schema.turn === position && schema.drawn === undefined && schema.discarded === undefined) {
                const [message] = schema.draw(position);
                socket.emit(message);
                autoPlayAfterDraw(socket, schema);
              } else {
                castIgnoreForPlayer(socket, schema, position);
              }
            } catch (error) {
              console.error(`Could not play on for ${name}:`, error.message);
            }
          }
        }
      } else {
        console.error("Unexpected error:", error);
      }
    } finally {
      if (name && sockets.get(name) === socket) {
        sockets.delete(name);
      }
      if (schemas) {
        playersInGame.set(schemas, playersInGame.get(schemas) - 1);
        // A disconnecting spectator never held a seat -- only affects the
        // room's connection count (handled above), nothing to clean up here.
        // Between games the seat is kept, so a player who reloads keeps their
        // place at the table.
        if (!schema.started && schemas.length === 1 && schema.hasPlayer(name)) {
          socket.broadcast(schema.removePlayer(name));
        }
        if (playersInGame.get(schemas) == 0) {
          games.delete(room);
          // Only rooms that were actually played are worth keeping. The old
          // guard read `schema.started || schemas.length >= 1`, and a room
          // always holds at least one game, so it was never anything but true:
          // a code somebody opened by accident was written out and kept exactly
          // like a game.
          if (schemas.some((game) => game.started)) {
            try {
              await Fs.promises.writeFile(
                filename(room),
                JSON.stringify(roomHistory(schemas)),
              );
            } catch (error) {
              console.error(error);
            }
          }
        }
      }
    }
  };
};
