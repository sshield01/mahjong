import { WINDS } from "../lib/schema.js";
import Message from "../socket/message.js";
import sockets from "./sockets.js";
import { autoPlayAfterDraw, isAbsent } from "./autoplay.js";
import playFinalRound from "./finalRound.js";

const votes = new WeakMap();

export default class Vote {
  constructor(method, priority) {
    this.method = method;
    this.priority = priority;
    this.win = false;
  }
}

export function handle(socket, schema, votes) {
  const turnPriority = schema.votePriority();
  const [action, winner] = WINDS.filter((wind) => votes[wind])
    .map((wind) => [votes[wind], wind])
    .reduce((a, b) => {
      if (a[0].priority > b[0].priority) {
        return a;
      }
      if (b[0].priority > a[0].priority) {
        return b;
      }
      if (turnPriority.indexOf(a[1]) < turnPriority.indexOf(b[1])) {
        return a;
      }
      return b;
    });

  const kong = !!Object.values(votes).find((vote) => vote.method === "Kong");

  switch (action.method) {
    case "Draw": {
      // Nobody claimed the discard and the wall is down to its last lap: the
      // 海底 round takes over from here and finishes the hand.
      if (playFinalRound(socket, schema)) break;
      // The wall can be spent by the time a round resolves -- there is simply no
      // tile left to hand over. Throwing here escapes vote resolution with the
      // round already deleted, and on the disconnect path, which has no message
      // to fail, it took the whole server process down. Leave the table as it
      // stands instead.
      let message, reveal;
      try {
        [message, reveal] = schema.draw(winner);
      } catch (error) {
        break;
      }
      const winnerName = schema[winner].name;
      const winnerSocket = sockets.get(winnerName);
      // A player who stepped away deliberately is still connected, so socket
      // liveness alone isn't enough -- without the away check they'd be handed a
      // tile and the table would sit waiting for a discard that never comes.
      if (winnerSocket && winnerSocket.raw.connected && !isAbsent(winnerName)) {
        winnerSocket.broadcast(message);
        winnerSocket.send(message.subject, { ...message.body, reveal });
      } else {
        socket.emit(message);
        autoPlayAfterDraw(socket, schema);
      }
      break;
    }
    case "Pong": {
      const message = schema.pong(winner);
      socket.emit(message);
      break;
    }
    case "Chow": {
      const message = schema.chow(winner, action.tiles);
      socket.emit(message);
      break;
    }
    case "Kong": {
      const [message, reveal] = schema.exposedKong(winner);
      const winnerSocket = sockets.get(schema[winner].name);
      if (winnerSocket && winnerSocket.raw.connected) {
        winnerSocket.broadcast(message);
        winnerSocket.send(message.subject, {
          ...message.body,
          reveal: [...message.body.reveal, reveal],
        });
      } else {
        socket.emit(message);
      }
      break;
    }
    case "Eyes": {
      const message = schema.eyes(winner, kong);
      socket.emit(message);
      break;
    }
    default:
      throw new Error(`Invalid method ${action.method}`);
  }
  // Pong, Chow and Kong only build the meld; declaring the win is a separate
  // step. `eyes()` is not like them -- it completes the game itself, scores it
  // and emits its own "win". Running the generic step after it asked
  // `winningHand` about a hand whose pair had just been moved into `down`,
  // leaving 12 tiles, which is never a winning shape: the claim was answered
  // with "You do not have a valid winning hand" even though the win had already
  // gone through. Only the throw was keeping `updateScores` from running twice.
  if (action.win && action.method !== "Eyes") {
    socket.emit(schema.win(schema[winner].name, kong));
  }
}

export function cast(socket, schema, vote) {
  if (schema.discarded === undefined) return;
  let gameVotes = votes.get(schema) || {};
  const position = schema.playerWind(socket.name);
  if (gameVotes[position]) return; // cannot vote twice
  gameVotes[position] = vote;

  const remaining = WINDS.filter(
    (wind) => schema[wind] && schema.previousTurn !== wind && !gameVotes[wind],
  );

  // A win is the highest possible priority, so once one is cast, no vote still
  // to come could ever outrank it -- UNLESS one of the remaining seats could
  // *also* win on this same discard, in which case we still need their vote to
  // correctly tie-break between simultaneous winners by turn order.
  const decisive = vote.win && remaining.every((wind) => !schema.couldWin(wind));

  if (remaining.length === 0 || decisive) {
    votes.delete(schema);
    handle(socket, schema, gameVotes);
  } else {
    votes.set(schema, gameVotes);
    socket.emit(new Message("vote", { position, vote }));
    for (const wind of remaining) {
      if (isAbsent(schema[wind].name)) {
        castIgnoreForPlayer(socket, schema, wind);
      }
    }
  }
}

export function emitCurrentVotes(socket, schema) {
  const gameVotes = votes.get(schema);
  if (!gameVotes) return;
  Object.entries(gameVotes).forEach(([position, vote]) => {
    socket.emit(new Message("vote", { position, vote }));
  });
}

export function castIgnoreForPlayer(socket, schema, position) {
  castAutoVoteForPlayer(socket, schema, position);
}

function castAutoVoteForPlayer(socket, schema, position) {
  // Nothing on the table to vote on. The disconnect path calls this whenever it
  // is not the leaver's turn, which includes the middle of someone else's.
  if (schema.discarded === undefined) return;
  // Nobody votes on their own discard, and a vote recorded for that seat would
  // be weighed against the real ones when the round resolves.
  if (schema.previousTurn === position) return;

  // Open the round if this is the first vote in it, exactly as `cast` does.
  // Giving up here instead left a discard nobody could ever answer: the player
  // whose turn it was to take it dropped, and everyone still at the table had
  // already had their say -- the discarder does not vote on their own tile.
  const gameVotes = votes.get(schema) || {};
  if (gameVotes[position]) return;

  const vote = schema.turn === position ? new DrawVote() : new IgnoreVote();
  gameVotes[position] = vote;

  const allCast = WINDS.filter(
    (wind) => schema[wind] && schema.previousTurn !== wind,
  ).every((wind) => gameVotes[wind]);

  if (allCast) {
    votes.delete(schema);
    handle(socket, schema, gameVotes);
  } else {
    votes.set(schema, gameVotes);
    socket.emit(new Message("vote", { position, vote }));
  }
}

class IgnoreVote extends Vote {
  constructor() {
    super("Ignore", 0);
  }
}

class DrawVote extends Vote {
  constructor() {
    super("Draw", 1);
  }
}

