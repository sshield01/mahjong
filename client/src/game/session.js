// Who this tab is, kept in sessionStorage rather than localStorage.
//
// localStorage is shared by every tab on the origin, and this is one key -- so
// several players sitting down from the same machine, which is how people play
// round one laptop, all wrote over the same record. Whoever sat down last owned
// it. After that any of the others reconnecting -- a refresh, or the socket
// blipping and re-handshaking on its own -- would offer somebody else's token,
// be refused as "already connected", and fall back to joining the room as a
// spectator. That is why a player who refreshed came back to their own hand
// showing blank: the server was building the view for a name that holds no seat.
// And with no seat, `seatOf(socket.name)` is undefined, so their client stopped
// voting on discards entirely -- which stalls the whole table if the other seats
// are away and nobody else can move the round on.
//
// sessionStorage survives a reload, which is what the session is for, and is
// scoped to the tab, which is what identity should be.
const KEY = "mahjong_session";

export function loadSession() {
  const saved = sessionStorage.getItem(KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch (error) {
    clearSession();
    return null;
  }
}

export function saveSession(session) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

// Keep the rest of the record and change only what moved -- the name, after
// sitting down or taking a seat back.
export function updateSession(patch) {
  const current = loadSession();
  if (current) saveSession({ ...current, ...patch });
}

export function clearSession() {
  sessionStorage.removeItem(KEY);
}
