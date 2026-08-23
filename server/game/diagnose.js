import { WINDS } from "../lib/schema.js";
import { isAbsent } from "./autoplay.js";
import { votesFor } from "./votes.js";

// A read-only snapshot of why a table is, or is not, moving.
//
// A stalled hand is hard to report: from a seat you cannot see whose vote the
// round is still waiting on, and that is usually the answer. This changes
// nothing -- it just says what the server currently believes -- so a stall can
// be reported with facts rather than guesses.
export default async function diagnose(socket, schema) {
  const round = votesFor(schema);
  const voters = WINDS.filter(
    (wind) => schema[wind] && schema.previousTurn !== wind,
  );

  return {
    room: schema.name,
    started: schema.started,
    completed: schema.completed,
    washedOut: schema.washedOut,
    turn: schema.turn,
    previousTurn: schema.previousTurn,
    // The tile on the table, and the one in the turn player's hand.
    discarded: schema.discarded === undefined ? null : schema.discarded,
    drawn: schema.drawn === undefined ? null : schema.drawn,
    wall: schema.tilesRemaining(),
    finalRound: schema.finalRound(),
    seats: WINDS.filter((wind) => schema[wind]).map((wind) => ({
      seat: wind,
      name: schema[wind].name,
      absent: isAbsent(schema[wind].name),
      concealed: schema[wind].up.length,
      melds: schema[wind].down.length,
    })),
    // The heart of it: is a round open, and whose answer is it short of?
    round:
      schema.discarded === undefined
        ? "no tile on the table"
        : round === null
          ? "a tile is on the table and nobody has voted yet"
          : {
              cast: Object.fromEntries(
                Object.entries(round).map(([seat, vote]) => [seat, vote.method]),
              ),
              waitingOn: voters.filter((wind) => !round[wind]),
            },
  };
}
