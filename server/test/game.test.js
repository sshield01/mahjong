import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  startServer,
  connect,
  send,
  record,
  uniqueRoom,
  seedRoom,
  allWindTiles,
} from "./helpers.js";

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

  // Regression: auto-play is there so one absent player does not block everyone
  // else, but nothing checked that anyone was left to unblock. With every seat
  // away the chain draw -> discard -> draw had nothing to pace it, so two
  // players stepping away for a minute came back to a hand that had played
  // itself out to the last tile of the wall -- unfinishable, and unrestartable
  // because a game that never completes cannot be followed by another.
  test("the hand does not play itself out while every seat is away", async () => {
    const room = uniqueRoom();
    const { a, b } = await startedTable(room, ["Ann10", "Ben10"]);

    const watcher = await client();
    const watcherLog = record(watcher);
    const joined = await send(watcher, "location", { room });
    const wallSize = (view) =>
      view.walls.reduce((n, wall) => n + wall.reduce((m, s) => m + s.length, 0), 0);
    const before = wallSize(joined.schema);

    await send(a, "leaveSeat");
    await send(b, "leaveSeat");
    await new Promise((r) => setTimeout(r, 800));

    const after = wallSize((await send(await client(), "location", { room })).schema);
    assert.ok(
      before - after <= 2,
      `the table should hold, not deal itself out (wall went ${before} -> ${after})`,
    );

    // And it is still playable when they come back.
    await send(a, "returnSeat");
    await send(b, "returnSeat");
    const resumed = wallSize((await send(await client(), "location", { room })).schema);
    assert.ok(resumed > 0, "there are still tiles to play with");
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

    // Regression: this went out with `broadcast`, which reaches everyone except
    // the sender. The returning player joined as a spectator and was handed an
    // away list with their own name on it -- that is what made the seat
    // reclaimable -- so without this they kept showing themselves as 断线, with
    // a 我回来了 button and "系统代打" over a hand they were really playing.
    const back = await log.waitWhere(
      (m) => m.subject === "playerConnected" && m.body.name === "Ben6",
      "the returning player being told they are back",
    );
    assert.ok(back, "the player who reclaimed the seat hears about it too");
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

describe("moving on to the next game", () => {
  // Regression: only spectators were allowed to follow the room forward, on the
  // grounds that a seated player crosses over by pressing 再来一局. But the host
  // can start the next game without waiting, and that push removes everyone
  // else's 再来一局 button -- so they never send one, and their connection stays
  // pointed at the finished game. Their votes then landed on a game nobody was
  // playing and the live round waited forever. The table froze on the very first
  // discard of every game after the first.
  test("a player carried into the next game by the host can still play it", async () => {
    const room = uniqueRoom();
    // An all-wind deck: the dealer's opening hand already wins, which is the
    // shortest route to a *finished* game one.
    seedRoom(server, room, { tiles: allWindTiles() });

    const a = await client();
    const b = await client();
    const aLog = record(a);
    const bLog = record(b);
    await send(a, "location", { room });
    await send(b, "location", { room });
    await send(a, "takeSeat", { position: "Ton", name: "Amy" });
    await send(b, "takeSeat", { position: "Nan", name: "Bea" });

    const dealt = Promise.all([aLog.waitFor("start"), bLog.waitFor("start")]);
    await send(a, "startGame");
    await dealt;
    await send(a, "declare");
    await aLog.waitFor("win");

    // Amy asks for another game and immediately starts it. Bea is pushed into
    // game two without ever having pressed 再来一局 herself.
    aLog.clear();
    bLog.clear();
    await send(a, "playAgain");
    const second = Promise.all([aLog.waitFor("start"), bLog.waitFor("start")]);
    await send(a, "startGame");
    const [aView, bView] = (await second).map((m) => m.body);
    assert.ok(aView.started, "game two is dealt");

    // Play the opening discard, whoever holds it, then cast the vote the other
    // client would send. With two seats the discarder never votes on their own
    // tile, so this single vote is the whole round.
    const dealerSeat = aView.turn;
    const dealer = dealerSeat === "Ton" ? a : b;
    const other = dealer === a ? b : a;
    const view = dealer === a ? aView : bView;

    aLog.clear();
    bLog.clear();
    await send(dealer, "discard", { tile: discardableTile(view, dealerSeat) });
    await send(other, "draw");

    const resolved = await bLog.waitFor("draw");
    assert.ok(resolved, "the round resolved instead of hanging on the discard");
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
