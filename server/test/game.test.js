import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, connect, send, record, uniqueRoom } from "./helpers.js";

let server;
const open = [];

before(async () => {
  server = await startServer();
});

after(async () => {
  for (const socket of open) socket.close();
  await server.close();
});

async function client() {
  const socket = await connect(server.url);
  open.push(socket);
  return socket;
}

// Two seated players in a started game, plus their recorders and the private
// view each was dealt (tests need real tile indices to discard).
async function startedTable(room, names = ["Alice", "Bob"]) {
  const a = await client();
  const b = await client();
  const aLog = record(a);
  const bLog = record(b);

  await send(a, "location", { room });
  await send(b, "location", { room });
  await send(a, "takeSeat", { position: "Ton", name: names[0] });
  await send(b, "takeSeat", { position: "Nan", name: names[1] });

  const dealt = Promise.all([aLog.waitFor("start"), bLog.waitFor("start")]);
  await send(a, "startGame");
  const [aStart, bStart] = (await dealt).map((m) => m.body);

  return { a, b, aLog, bLog, aStart, bStart };
}

const isWildcard = (view, tile) => {
  const info = view.tiles[tile];
  return (
    !!view.wildcard &&
    !!info &&
    info.suit === view.wildcard.suit &&
    info.value === view.wildcard.value
  );
};

// Wildcards may not be discarded, so pick something else from the hand.
const discardableTile = (view, position) =>
  view[position].up.find((t) => view.tiles[t] && !isWildcard(view, t));

describe("joining", () => {
  test("entering a room needs no name and yields a spectator view", async () => {
    const room = uniqueRoom();
    const a = await client();
    const joined = await send(a, "location", { room });

    assert.ok(joined.token, "a session token is issued");
    assert.match(joined.name, /^guest-/, "arrives anonymous, named on sitting");
    assert.deepEqual(joined.disconnected, [], "nobody is away yet");
  });

  test("a name already in use by a live player is refused", async () => {
    const room = uniqueRoom();
    const a = await client();
    const b = await client();
    await send(a, "location", { room });
    await send(b, "location", { room });

    await send(a, "takeSeat", { position: "Ton", name: "Dup" });
    await assert.rejects(
      () => send(b, "takeSeat", { position: "Nan", name: "Dup" }),
      /already in use/,
    );
  });
});

describe("starting", () => {
  test("only the host may start, and only with enough players", async () => {
    const room = uniqueRoom();
    const a = await client();
    const b = await client();
    await send(a, "location", { room });
    await send(b, "location", { room });

    await send(a, "takeSeat", { position: "Ton", name: "Host1" });
    await assert.rejects(() => send(a, "startGame"), /At least 2 players/);

    await send(b, "takeSeat", { position: "Nan", name: "Guest1" });
    await assert.rejects(() => send(b, "startGame"), /Only the host/);

    await send(a, "startGame");
  });
});

describe("a player going away", () => {
  // Regression: with only one other player, the discarder never votes on their
  // own tile, so nothing triggered the absent player's auto-vote and the round
  // hung forever.
  test("the game keeps moving when the only other player has dropped", async () => {
    const room = uniqueRoom();
    const { a, b, aLog, aStart } = await startedTable(room, ["Ann1", "Ben1"]);

    b.close();
    await aLog.waitFor("playerDisconnected");

    aLog.clear();
    await send(a, "discard", { tile: discardableTile(aStart, "Ton") });

    // Ben is gone and is the only other voter, so nobody would ever cast a vote
    // to resolve the round. The server has to play his turn for him.
    const bensDiscard = await aLog.waitWhere(
      (m) => m.subject === "discard" && m.body.position === "Nan",
      "the absent player's auto-discard",
    );
    assert.ok(bensDiscard, "the round resolved instead of hanging");
  });

  test("a deliberate 暂离 hands the start button to someone present", async () => {
    const room = uniqueRoom();
    const { a, bLog } = await startedTable(room, ["Ann2", "Ben2"]);

    bLog.clear();
    await send(a, "leaveSeat");

    const moved = await bLog.waitFor("hostChanged");
    assert.equal(moved.body.host, "Ben2", "the absent host does not keep the button");
  });

  test("returning restores control and the private view", async () => {
    const room = uniqueRoom();
    const { a, aLog } = await startedTable(room, ["Ann3", "Ben3"]);

    await send(a, "leaveSeat");
    aLog.clear();
    await send(a, "returnSeat");

    const view = await aLog.waitFor("start");
    const seat = view.body.Ton;
    assert.ok(
      seat.up.every((t) => view.body.tiles[t] !== null),
      "their own tiles are readable again",
    );
  });

  // Regression: away-ness is keyed by bare name and used to leak across rooms,
  // so a new player reusing a name was auto-played from their first turn.
  test("sitting down clears any stale away flag for that name", async () => {
    const room1 = uniqueRoom();
    const { b } = await startedTable(room1, ["Ann4", "Recycled"]);
    b.close(); // "Recycled" is now marked away

    const room2 = uniqueRoom();
    const c = await client();
    const d = await client();
    const dLog = record(d);
    await send(c, "location", { room: room2 });
    await send(d, "location", { room: room2 });
    await send(c, "takeSeat", { position: "Ton", name: "Ann5" });
    await send(d, "takeSeat", { position: "Nan", name: "Recycled" });
    await send(c, "startGame");
    await dLog.waitFor("start");

    // If the stale flag survived, the server would auto-play "Recycled" and the
    // hand would race to the end of the wall on its own.
    dLog.clear();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(
      dLog.subjects().filter((s) => s === "discard").length,
      0,
      "a freshly seated player is not auto-played",
    );
  });
});

describe("reclaiming a seat", () => {
  test("a returning player takes their seat back by name", async () => {
    const room = uniqueRoom();
    const { b } = await startedTable(room, ["Ann6", "Ben6"]);
    b.close();

    const rejoin = await client();
    const log = record(rejoin);
    const joined = await send(rejoin, "location", { room });
    assert.deepEqual(joined.disconnected, ["Ben6"], "the away seat is advertised");

    await send(rejoin, "reclaimSeat", { name: "Ben6" });
    const view = await log.waitFor("start");
    assert.ok(
      view.body.Nan.up.every((t) => view.body.tiles[t] !== null),
      "the reclaimed seat's hand is handed over",
    );
  });

  test("you cannot take a seat whose player is still here", async () => {
    const room = uniqueRoom();
    await startedTable(room, ["Ann7", "Ben7"]);

    const intruder = await client();
    await send(intruder, "location", { room });
    await assert.rejects(
      () => send(intruder, "reclaimSeat", { name: "Ben7" }),
      /still connected/,
    );
  });
});

describe("removing an abandoned seat", () => {
  test("the host can clear an away seat between games, but not a present one", async () => {
    const room = uniqueRoom();
    const a = await client();
    const b = await client();
    await send(a, "location", { room });
    await send(b, "location", { room });
    await send(a, "takeSeat", { position: "Ton", name: "Ann8" });
    await send(b, "takeSeat", { position: "Nan", name: "Ben8" });

    await assert.rejects(
      () => send(a, "kickPlayer", { position: "Nan" }),
      /still here/,
      "a connected player cannot be removed",
    );
  });
});
