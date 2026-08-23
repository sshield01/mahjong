# Mahjong

> Work in progress: This game is probably functional, but has not been thoroughly tested. Play at your own risk.

Play Mahjong in your browser with your friends.

Please note this is the real Mahjong game, not the weird tile matching one. We don't play that one.

## Installation

This repository uses submodules. Clone using `--recursive` (or initialize submodules manually if
it's already too late):

```sh
git clone --recursive git@github.com:foxfriends/mahjong

# OR, after cloning normally
git submodule init
git submodule update
```

## Usage

```bash
# Create a directory for the games to be saved to
mkdir state

# Compile the client
cd client
npm install
npm run build

# Then run the server
cd server
npm install
npm start
```

You can now visit `localhost:1234` in your browser to play. Enter your name, and then enter a game name. All
players (up to 4) who enter the same game name will join that game. Once all players have pressed "Ready", the
game will begin.

## Developing

Very similar to running, but run the client as `npm start` instead of building it:

```bash
# Compile the client
cd client
npm install
npm start

# Then run the server
cd server
npm install
npm start
```

You'll have to restart the server manually when it changes, but the client will rebuild automatically.

## Testing

```bash
cd server
npm install
npm test
```

The suite uses Node's built-in test runner, so there is nothing to install beyond
the server's own dependencies. It covers two layers:

- `server/test/schema.test.js` — the rules engine directly: dealing, seating and
  host handover, concealed views, and winning hands.
- `server/test/game.test.js` — the socket protocol end to end, by starting the
  real server in-process and driving it with actual clients: joining, seating,
  starting, auto-play for absent players, reclaiming a seat, and host transfer.

Both run in CI on every push and pull request, along with a full client build
(which compiles every Svelte component and so catches broken templates). The
release workflow depends on that job, so a failing test blocks the deploy.

Note that `client/src/lib` and `client/src/socket` are symlinks into `server/`.
Windows checkouts with `core.symlinks=false` materialise them as plain text
files and the client build cannot resolve them; the Dockerfile and CI copy the
directories in instead, and locally you can replace the two entries with
directory junctions.

## Configuration

The port (`mahjong_port`) and save data directory (`mahjong_state`) can be changed by modifying the
values in `server/.env`. Changing the `mahjong_dist` directory is not recommended.
