/** Base class for all typed bracket-engine errors so callers can `instanceof` narrow. */
export class BracketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class MatchNotFoundError extends BracketError {
  constructor(matchId: string) {
    super(`Match not found: ${matchId}`);
  }
}

export class InvalidMatchStateError extends BracketError {
  constructor(message: string) {
    super(message);
  }
}

export class MatchNotEditableError extends BracketError {
  constructor(matchId: string) {
    super(`Match ${matchId} cannot be edited: a downstream match has already started`);
  }
}

/** A knockout match ended in a draw without penalties (or a manual/walkover winner). */
export class KoDrawRequiresDecisionError extends BracketError {
  constructor(matchId: string) {
    super(
      `Match ${matchId} is a knockout match tied in regulation; provide pens1/pens2 or ` +
        `decidedBy 'manual'/'walkover' with winnerEntryId`,
    );
  }
}

export class InvalidResultError extends BracketError {
  constructor(message: string) {
    super(message);
  }
}
