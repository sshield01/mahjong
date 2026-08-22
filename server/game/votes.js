import { WINDS } from "../lib/schema.js";
import Message from "../socket/message.js";
import sockets from "./sockets.js";
import { autoPlayAfterDraw, autoPlayAfterDiscard, isDisconnected } from "./autoplay.js";

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
      const [message, reveal] = schema.draw(winner);
      const winnerSocket = sockets.get(schema[winner].name);
      if (winnerSocket && winnerSocket.raw.connected) {
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
  if (action.win) {
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
      if (isDisconnected(schema[wind].name)) {
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
  const gameVotes = votes.get(schema);
  if (!gameVotes) return;
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
