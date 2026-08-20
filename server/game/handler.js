import AsyncSocket, { Disconnect } from "../socket/socket.js";
import Schema from "../lib/schema.js";
import Fs from "fs";
import Crypto from "crypto";
import sockets from "./sockets.js";
import * as handlers from "./handlers.js";
import { emitCurrentVotes, castIgnoreForPlayer } from "./votes.js";
import { markDisconnected, markConnected, autoPlayAfterDraw, autoPlayAfterDiscard } from "./autoplay.js";

const games = new Map();
const playersInGame = new WeakMap();
const sessions = new Map();

export default (io, stateDirectory) => {
  const filename = (name) => `${stateDirectory}/${name}`;

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

  async function tryReconnect(socket) {
    const message = await socket.recv();
    if (message.subject === "reconnect") {
      const { token } = message.body || {};
      const session = token && sessions.get(token);
      if (!session) {
        message.fail("Session expired.");
        return null;
      }
      const { name, room } = session;
      if (sockets.has(name)) {
        const existing = sockets.get(name);
        if (!existing.raw.connected) {
          sockets.delete(name);
        } else {
          message.fail("Already connected.");
          return null;
        }
      }
      let schemas;
      try {
        schemas = await loadSchema(room);
      } catch (error) {
        message.fail("Room no longer exists.");
        sessions.delete(token);
        return null;
      }
      const schema = schemas[schemas.length - 1];
      if (!schema.hasPlayer(name)) {
        message.fail("Player not in game.");
        sessions.delete(token);
        return null;
      }
      socket.identify(name);
      sockets.set(name, socket);
      socket.join(room);
      markConnected(name);
      playersInGame.set(schemas, playersInGame.get(schemas) + 1);
      message.success({ schema: Schema.concealed(schema, name), name, room, token });
      return { name, room, schemas, token };
    }
    if (message.subject === "identification") {
      return { firstMessage: message };
    }
    message.fail("Expected identification or reconnect.");
    return null;
  }

  async function identification(socket, firstMessage) {
    let message = firstMessage;
    for (;;) {
      if (!message) {
        message = await socket.expect("identification");
      }
      const name = message.body.name;
      if (!name) {
        message.fail("Required parameter `name` is missing.");
        message = null;
        continue;
      }
      if (sockets.has(name)) {
        const existing = sockets.get(name);
        if (!existing.raw.connected) {
          sockets.delete(name);
        } else {
          message.fail(`The name ${name} is already in use.`);
          message = null;
          continue;
        }
      }
      socket.identify(name);
      sockets.set(name, socket);
      message.success();
      return name;
    }
  }

  async function location(socket, name) {
    for (;;) {
      const location = await socket.expect("location");
      const room = location.body.room;
      if (!room) {
        location.fail("Required parameter `room` is missing.");
        continue;
      }

      let schemas, schema;
      try {
        schemas = await loadSchema(room);
        schema = schemas[schemas.length - 1];
      } catch (error) {
        location.fail(error);
        continue;
      }

      if (!schema.hasPlayer(name)) {
        if (schema.started || schemas.length > 1) {
          location.fail(`The game ${room} has started without you.`);
          continue;
        }
        if (!schema.hasSpace()) {
          location.fail(`The game ${room} is already full.`);
          continue;
        }
      }

      const token = Crypto.randomBytes(16).toString("hex");
      sessions.set(token, { name, room });

      socket.join(room);
      playersInGame.set(schemas, playersInGame.get(schemas) + 1);
      if (!schema.hasPlayer(name)) {
        socket.broadcast(schema.addPlayer(name));
      }

      location.success({ schema: Schema.concealed(schema, name), token });
      return [room, schemas, token];
    }
  }

  return async (rawSocket) => {
    const socket = new AsyncSocket(rawSocket, io);
    let name, room, schemas, schema, token;
    try {
      const reconnected = await tryReconnect(socket);
      if (reconnected && reconnected.firstMessage) {
        name = await identification(socket, reconnected.firstMessage);
        [room, schemas, token] = await location(socket, name);
      } else if (reconnected) {
        ({ name, room, schemas, token } = reconnected);
      } else {
        name = await identification(socket, null);
        [room, schemas, token] = await location(socket, name);
      }
      let n = schemas.length - 1;
      schema = schemas[n];
      emitCurrentVotes(socket, schema);

      for (;;) {
        const message = await socket.recv();
        if (schema.completed && message.subject === "playAgain") {
          ++n;
          if (schemas.length === n) {
            schemas.push(Schema.nextGame(schema, schemas[0]));
          }
          schema = schemas[n];
          message.success({ schema: Schema.concealed(schema, name) });
          await handlers.ready(socket, schema, { ready: true });
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
        }
      }
    } catch (error) {
      if (error instanceof Disconnect) {
        if (name) {
          console.log(`${name} has left`);
          markDisconnected(name);
        }
        if (schema && schema.started && !schema.completed) {
          const position = schema.playerWind(name);
          if (position) {
            if (schema.turn === position && schema.drawn !== undefined) {
              autoPlayAfterDraw(socket, schema);
            } else if (schema.turn === position && schema.drawn === undefined && schema.discarded === undefined) {
              try {
                const [message, reveal] = schema.draw(position);
                socket.emit(message);
                autoPlayAfterDraw(socket, schema);
              } catch (e) { /* wall exhausted */ }
            } else {
              castIgnoreForPlayer(socket, schema, position);
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
        if (!schema.started) {
          if (schemas.length === 1) {
            socket.broadcast(schema.removePlayer(name));
          } else {
            await handlers.ready(socket, schema, { ready: false });
          }
        }
        if (playersInGame.get(schemas) == 0) {
          games.delete(room);
          if (schema.started || schemas.length >= 1) {
            try {
              await Fs.promises.writeFile(
                filename(room),
                JSON.stringify(schemas),
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
