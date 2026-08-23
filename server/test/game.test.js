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
import { markConnected } from "../game/autoplay.js";
import { sweepRooms } from "../game/handler.js";
import Fs from "fs";
import Path from "path";

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

describe("listing live rooms", () => {
  // Asked by a page opened with no room in the URL, before that connection has
  // said who it is -- which is exactly when it needs answering.
  test("lists tables that have someone at them, and keeps listening after", async () => {
    const quiet = uniqueRoom();
    const busy = uniqueRoom();

    // A room nobody is in: created, then abandoned.
    const passerby = await client();
    await send(passerby, "location", { room: quiet });
    passerby.close();
    await new Promise((r) => setTimeout(r, 300));

    const host = await client();
    await send(host, "location", { room: busy });
    await send(host, "takeSeat", { position: "Ton", name: "Ida" });

    const browser = await client();
    const { rooms } = await send(browser, "rooms");
    const listed = rooms.find((entry) => entry.room === busy);

    assert.ok(listed, "a room with somebody in it is listed");
    assert.deepEqual(listed.players, ["Ida"], "with who is sitting at it");
    assert.equal(listed.playing, false, "and whether a hand is under way");
    assert.ok(
      !rooms.some((entry) => entry.room === quiet),
      "a room nobody is in is not listed",
    );

    // Asking identified nobody, so the same connection can still join normally.
    const joined = await send(browser, "location", { room: busy });
    assert.ok(joined.token, "the handshake still works afterwards");
  });

  test("a room already playing says so", async () => {
    const room = uniqueRoom();
    await startedTable(room, ["Ivy", "Ike"]);

    const browser = await client();
    const { rooms } = await send(browser, "rooms");
    const listed = rooms.find((entry) => entry.room === room);

    assert.ok(listed);
    assert.equal(listed.playing, true);
    assert.deepEqual(listed.players.sort(), ["Ike", "Ivy"]);
  });
});

describe("what a room leaves behind", () => {
  const stateFile = (room) => Path.join(server.stateDirectory, room);
  const settle = () => new Promise((r) => setTimeout(r, 400));

  test("a room nobody played is not written out at all", async () => {
    const room = uniqueRoom();
    const passerby = await client();
    await send(passerby, "location", { room });
    await send(passerby, "takeSeat", { position: "Ton", name: "Opened" });
    passerby.close();
    await settle();

    assert.equal(
      Fs.existsSync(stateFile(room)),
      false,
      "opening a room code and wandering off should leave nothing on disk",
    );
  });

  // Every 再来一局 appends another whole game. Only the first is ever read again
  // -- its dealer fixes the prevailing wind -- along with the one being played.
  test("only the first game and the current one are kept", async () => {
    const room = uniqueRoom();
    // A room five rounds deep. Each game is tagged by who sat at 东 so it is
    // clear which two survived.
    const round = (n) => ({
      name: room,
      started: true,
      tiles: [],
      walls: [[], [], [], []],
      Ton: {
        name: `round${n}`,
        up: [], down: [], discarded: [], ready: false, exposedWildcards: [],
      },
    });
    Fs.writeFileSync(
      stateFile(room),
      JSON.stringify([0, 1, 2, 3, 4].map(round)),
    );

    // Somebody looks in and leaves again, which is what writes the room back.
    const visitor = await client();
    await send(visitor, "location", { room });
    visitor.close();
    await settle();

    const kept = JSON.parse(Fs.readFileSync(stateFile(room), "utf8"));
    assert.equal(kept.length, 2, "five games in, two written back");
    assert.equal(kept[0].Ton.name, "round0", "the first, for the wind rotation");
    assert.equal(kept[1].Ton.name, "round4", "and the one being played");
  });

  test("rooms nobody has touched for a while are forgotten", async () => {
    const fresh = uniqueRoom();
    const stale = uniqueRoom();
    const busy = uniqueRoom();
    for (const room of [fresh, stale, busy]) {
      Fs.writeFileSync(stateFile(room), JSON.stringify([{ name: room }]));
    }
    // Backdate one of them by two days.
    const old = Date.now() / 1000 - 2 * 24 * 60 * 60;
    Fs.utimesSync(stateFile(stale), old, old);

    const forgotten = await sweepRooms(
      server.stateDirectory,
      24 * 60 * 60 * 1000,
      (room) => room === busy, // pretend somebody is in this one
    );

    assert.deepEqual(forgotten, [stale]);
    assert.equal(Fs.existsSync(stateFile(stale)), false, "the idle one is gone");
    assert.equal(Fs.existsSync(stateFile(fresh)), true, "a recent one is kept");
    assert.equal(Fs.existsSync(stateFile(busy)), true, "and a live one is never touched");
  });

  test("a ttl of zero turns sweeping off", async () => {
    const room = uniqueRoom();
    Fs.writeFileSync(stateFile(room), JSON.stringify([{ name: room }]));
    const old = Date.now() / 1000 - 365 * 24 * 60 * 60;
    Fs.utimesSync(stateFile(room), old, old);

    assert.deepEqual(await sweepRooms(server.stateDirectory, 0), []);
    assert.equal(Fs.existsSync(stateFile(room)), true);
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

  // Regression: a player drops in the window right after somebody discards, so
  // the discard was advertised to a seat that is now empty. Nobody else can move
  // it on -- the discarder does not vote on their own tile, and it is not their
  // turn -- and the round is only created by the first vote cast into it, which
  // the auto-vote used to decline to do. The table stopped dead on that discard.
  test("a discard is still answered when the player who owes an answer drops", async () => {
    const room = uniqueRoom();
    const { a, b, aLog, aStart } = await startedTable(room, ["Ann12", "Ben12"]);

    aLog.clear();
    await send(a, "discard", { tile: discardableTile(aStart, "Ton") });
    b.close();

    const moved = await aLog.waitFor("draw");
    assert.ok(moved, "the table moved on instead of stopping on the discard");
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
      /still at the table/,
    );
  });

  // Regression: rooms are written to disk but the away flag is not, so restarting
  // the server -- a rebuild, a redeploy -- brought a room back with its seats
  // still held by name and nobody marked away. Gating on that flag, the server
  // insisted everyone was still sitting there: seats could not be reclaimed or
  // cleared and the room was locked out of itself for good. A name with no live
  // socket behind it is unattended whatever the flag says.
  test("a seat is reclaimable when nothing is holding it, flag or no flag", async () => {
    const room = uniqueRoom();
    const { a, b } = await startedTable(room, ["Ann13", "Ben13"]);

    // Drop both without the disconnect bookkeeping ever running, the way a
    // restart loses it.
    a.close();
    b.close();
    await new Promise((r) => setTimeout(r, 300));
    markConnected("Ann13");
    markConnected("Ben13");

    const returning = await client();
    const log = record(returning);
    const joined = await send(returning, "location", { room });
    assert.deepEqual(
      [...joined.disconnected].sort(),
      ["Ann13", "Ben13"],
      "seats nobody is holding are advertised as free to take back",
    );

    await send(returning, "reclaimSeat", { name: "Ann13" });
    const view = await log.waitFor("start");
    assert.ok(
      view.body.Ton.up.every((t) => view.body.tiles[t] !== null),
      "and the hand comes back with it",
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
