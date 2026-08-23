import Http from "http";
import IO from "socket.io";
import IOClient from "socket.io-client";
import Fs from "fs";
import Os from "os";
import Path from "path";
import SocketHandler from "../game/handler.js";

// Boots the real socket layer in-process -- same wiring as index.js, minus Koa
// and the static client, so tests exercise the actual game handlers.
export async function startServer() {
  const stateDirectory = Fs.mkdtempSync(Path.join(Os.tmpdir(), "mahjong-test-"));
  const server = Http.createServer();
  const io = IO(server);
  io.on("connection", SocketHandler(io, stateDirectory));

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      io.close();
      await new Promise((resolve) => server.close(resolve));
      Fs.rmSync(stateDirectory, { recursive: true, force: true });
    },
  };
}

export function connect(url) {
  return new Promise((resolve) => {
    const socket = IOClient(url, { forceNew: true, transports: ["websocket"] });
    socket.on("connect", () => resolve(socket));
  });
}

// Mirrors the client's AsyncSocket.send: request/ack, rejecting on `error`.
export function send(socket, subject, body) {
  return new Promise((resolve, reject) => {
    socket.send({ subject, body }, (reply) => {
      if (reply && reply.error) reject(new Error(reply.error));
      else resolve(reply && reply.body);
    });
  });
}

// Records every server->client message so a test can assert on what arrived.
export function record(socket) {
  const messages = [];
  socket.on("message", (m) => messages.push(m));
  return {
    messages,
    clear: () => (messages.length = 0),
    find: (subject) => messages.find((m) => m.subject === subject),
    subjects: () => messages.map((m) => m.subject),
    // Server work is asynchronous, so wait for a message rather than sleeping a
    // fixed amount and hoping.
    waitWhere(predicate, label = "message", timeout = 3000) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.off("message", onMessage);
          reject(new Error(`timed out waiting for ${label}`));
        }, timeout);
        const onMessage = (m) => {
          if (!predicate(m)) return;
          clearTimeout(timer);
          socket.off("message", onMessage);
          resolve(m);
        };
        socket.on("message", onMessage);
      });
    },
    waitFor(subject, timeout = 3000) {
      return this.waitWhere((m) => m.subject === subject, `"${subject}"`, timeout);
    },
  };
}

// A deck of nothing but winds: `winningHand` short-circuits on an all-wind hand,
// so the dealer can declare immediately. Lets a test reach a *finished* game in
// one move instead of playing a hand out.
export function allWindTiles() {
  const winds = ["Ton", "Nan", "Shaa", "Pei"];
  return Array.from({ length: 136 }, (_, i) => ({
    suit: "wind",
    value: winds[i % 4],
  }));
}

let roomCounter = 0;
// Room and player names are global keys on the server, so keep them unique per
// test to avoid one test's leftovers colouring another's.
export const uniqueRoom = () => `T${process.pid}_${roomCounter++}`;
export const uniqueName = (base) => `${base}_${process.pid}_${roomCounter}`;
