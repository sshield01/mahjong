<script context='module'>
  const SIDE = {
    Ton: 'bottom',
    Shaa: 'top',
    Nan: 'right',
    Pei: 'left',
  };
</script>

<script>
  import Table from './Table.svelte';
  import Title from './Title.svelte';
  import Tiles from './Tiles.svelte';
  import Status from './Status/Status.svelte';
  import handler from '../game/handler.js';
  import { dealerSeat } from '../lib/schema.js';
  import context, { init } from '../game/context.js';
  import { loadSession, saveSession, clearSession } from '../game/session.js';

  export let socket;

  init(socket);
  const ctx = context();
  const { store, myName, absent } = ctx;

  let errorMessage;

  const PLAY = Symbol();
  const CONNECTING = Symbol();
  const RECONNECTING = Symbol();
  const FAILED = Symbol();
  const BROWSING = Symbol();

  function getRoomFromUrl() {
    const hash = window.location.hash.slice(1);
    return hash || null;
  }

  function generateRoom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  let state = CONNECTING;

  function enterGame(result, room) {
    socket.name = result.name;
    $myName = result.name;
    // Who was already missing before we arrived; kept current after this by the
    // playerDisconnected / playerConnected broadcasts.
    $absent = new Set(result.disconnected || []);
    if (result.token) {
      saveSession({ token: result.token, name: result.name, room });
    }
    window.location.hash = room;
    // `AsyncSocket` throws into the message loop when the socket drops, which is
    // how the loop ends. Catch it: unhandled it just logs, and the app would go
    // on showing a table it had stopped listening for updates to.
    handler(result.schema, ctx).catch(() => {
      if (state === PLAY) state = RECONNECTING;
    });
    state = PLAY;
  }

  // A tab that was just refreshed may still be registered on the server under the
  // old socket, which makes `reconnect` fail with "Already connected." until it
  // drops. The handshake is a retry loop now, so simply asking again works.
  const RECONNECT_RETRY_DELAYS = [500, 1000, 2000, 4000];

  let connecting = false;
  async function connect() {
    if (connecting) return;
    connecting = true;
    try {
      await handshake();
    } finally {
      connecting = false;
    }
  }

  async function handshake() {
    const room = getRoomFromUrl() || generateRoom();
    window.location.hash = room;

    // A saved session means we may already own a seat in this room -- always try
    // to reclaim it before falling back to joining fresh as a spectator.
    const session = loadSession();
    if (session && session.token && session.room === room) {
      for (let attempt = 0; ; attempt++) {
        try {
          enterGame(await socket.send('reconnect', { token: session.token }), session.room);
          return;
        } catch (error) {
          // Only "Already connected." is worth waiting out; an expired session
          // or a vanished room will never start working, so stop and join fresh.
          if (error !== 'Already connected.' || attempt >= RECONNECT_RETRY_DELAYS.length) {
            clearSession();
            break;
          }
          state = RECONNECTING;
          await new Promise((resolve) => setTimeout(resolve, RECONNECT_RETRY_DELAYS[attempt]));
        }
      }
    }

    // No seat to reclaim: walk in and watch. Sitting down is what asks for a name.
    try {
      enterGame(await socket.send('location', { room }), room);
    } catch (error) {
      errorMessage = error;
      state = FAILED;
    }
  }

  // Arriving with no room in the URL is not a request for a random one: it is
  // someone who wants to find a table. Show what is being played and let them
  // pick, or start one of their own.
  let rooms = [];
  let browseError = null;
  let browseTimer = null;

  async function refreshRooms() {
    try {
      const result = await socket.send('rooms', {});
      rooms = (result && result.rooms) || [];
      browseError = null;
    } catch (error) {
      browseError = typeof error === 'string' ? error : '房间列表暂时读不到';
    }
  }

  const REFRESH_EVERY = 5000;

  async function browse() {
    state = BROWSING;
    await refreshRooms();
    // People come and go while you are looking at the list.
    if (browseTimer === null) browseTimer = window.setInterval(refreshRooms, REFRESH_EVERY);
  }

  function enterRoom(room) {
    if (browseTimer !== null) {
      window.clearInterval(browseTimer);
      browseTimer = null;
    }
    window.location.hash = room;
    state = CONNECTING;
    connect();
  }

  if (getRoomFromUrl()) {
    connect();
  } else {
    browse();
  }

  // socket.io puts the transport back on its own after a blip -- a phone
  // locking, wifi dropping, a laptop waking up. What it cannot do is tell the
  // server who we are: that connection is brand new, with no handshake behind
  // it, so every message sent down it came back "Expected reconnect or
  // location." while this client sat in PLAY looking perfectly fine. Nothing
  // worked again until the page was reloaded, which is what made a reload look
  // like it "fixed" things. Shake hands again and pick the game back up.
  socket.raw.on('disconnect', () => {
    if (state === PLAY) state = RECONNECTING;
  });
  socket.raw.on('reconnect', () => {
    // Still choosing a table: re-handshaking here would invent a room and drop
    // us into it. Just fetch the list again.
    if (state === BROWSING) {
      refreshRooms();
      return;
    }
    connect();
  });

  // The three-quarter view you start at, and the straight-down one. 0 lays the
  // table flat in the screen plane, which is why `Tile` stops standing your hand
  // on edge at that angle -- edge-on tiles would be unreadable from above.
  const RESTING_ANGLE = 60;
  const TOP_ANGLE = 0;

  let adjustment = 0;
  $: tableAngle = Math.min(90, Math.max(0, RESTING_ANGLE + adjustment));

  // The board is a square of min(100vw, 100vh). At the resting angle it is
  // foreshortened to roughly half that on screen, and that slack is what leaves
  // the corners free for the wind and wildcard badges. Flatten the view and the
  // square stands up to its full height, sliding under those badges and pressing
  // your own hand into the bottom edge -- so pull it back as the view flattens.
  // Unchanged at the resting angle and above; smallest looking straight down.
  const TOP_VIEW_SCALE = 0.8;
  $: tableScale = Math.min(
    1,
    TOP_VIEW_SCALE + (1 - TOP_VIEW_SCALE) * (tableAngle / RESTING_ANGLE),
  );
  const SPEED = 3;
  function scroll(event) {
    if (state !== PLAY) return;
    const direction = event.deltaY / Math.abs(event.deltaY);
    if (tableAngle + direction * SPEED <= 90 && tableAngle + direction * SPEED >= 0) {
      adjustment += direction * SPEED;
    }
  }

  // A double click is always "get me out of where I am": from the resting angle
  // it drops to the top-down view, and from anywhere else -- the top view
  // included -- it comes back to resting. So the gesture stays a single toggle
  // and can never strand you at an angle you scrolled to by accident.
  function toggleAngle() {
    if (state !== PLAY) return;
    adjustment = tableAngle === RESTING_ANGLE ? TOP_ANGLE - RESTING_ANGLE : 0;
  }

  let touchStartY = null;
  function touchstart(event) {
    if (state !== PLAY) return;
    if (event.touches.length === 2) {
      touchStartY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    }
  }
  function touchmove(event) {
    if (state !== PLAY || touchStartY === null) return;
    if (event.touches.length === 2) {
      const currentY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      const delta = (currentY - touchStartY) * 0.3;
      const newAngle = RESTING_ANGLE + adjustment + delta * 0.5;
      if (newAngle >= 0 && newAngle <= 90) {
        adjustment += delta * 0.5;
      }
      touchStartY = currentY;
    }
  }
  function touchend() {
    touchStartY = null;
  }
</script>

<svelte:window on:wheel={scroll} on:dblclick={toggleAngle} on:touchstart={touchstart} on:touchmove={touchmove} on:touchend={touchend} />
<div class="layer full">
  <Table
    angle={state === PLAY ? tableAngle : 0}
    scale={state === PLAY ? tableScale : 1}
    rotation={$store && $store.seatOf($myName) ? ['Ton', 'Nan', 'Shaa', 'Pei'].indexOf($store.seatOf($myName)) * 90 : 0}
    bottomLabel={$store && $store.Ton && $store.Ton.name}
    topLabel={$store && $store.Shaa && $store.Shaa.name}
    rightLabel={$store && $store.Nan && $store.Nan.name}
    leftLabel={$store && $store.Pei && $store.Pei.name}
    highlightSide={SIDE[$store && $store.turn] || null}
    dealerSide={$store && $store.started ? SIDE[dealerSeat($store)] || null : null}
    >
    <Tiles {tableAngle} />
  </Table>
</div>

{#if state === PLAY}
  <div class="layer">
    <Status />
  </div>
{:else if state === CONNECTING || state === RECONNECTING}
  <div class="layer full title">
    <Title>
      <div class="form info">
        {state === RECONNECTING ? '重新连接中...' : '连接中...'}
      </div>
    </Title>
  </div>
{:else if state === BROWSING}
  <div class="layer full title">
    <Title>
      <div class="form">
        {#if browseError}
          <div class="error">{browseError}</div>
        {/if}
        {#if rooms.length === 0}
          <div class="info">现在没有人开局</div>
        {:else}
          <div class="rooms">
            {#each rooms as entry (entry.room)}
              <button class="room" on:click={() => enterRoom(entry.room)}>
                <span class="room-code">{entry.room}</span>
                <span class="room-who">
                  {entry.players.length ? entry.players.join('、') : '还没有人入座'}
                </span>
                <span class="room-state">{entry.playing ? '进行中' : '等待中'}</span>
              </button>
            {/each}
          </div>
        {/if}
        <button class="button" on:click={() => enterRoom(generateRoom())}>新建房间</button>
      </div>
    </Title>
  </div>
{:else if state === FAILED}
  <div class="layer full title">
    <Title>
      <div class="form">
        <div class="error">{errorMessage}</div>
        <button class="button" on:click={() => window.location.reload()}>重试</button>
      </div>
    </Title>
  </div>
{/if}

<style>
.layer {
  position: absolute;
  top: 0;
  left: 0;
}

.full {
  width: 100%;
  height: 100%;
}

.title, .button {
  color: white;
}

.form {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 600px;
  margin: clamp(20px, 5vh, 50px) auto;
  padding: 0 16px;
  box-sizing: border-box;
}

.button {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  cursor: pointer;

  margin: 12px 0;
  padding: 12px 24px;
  margin-left: auto;
  font-size: clamp(12pt, 3.5vw, 14pt);

  font-family: var(--font-english);
  /* Press feedback to match the room rows, which already brighten on hover --
     this is the entry-point CTA (新建房间 / 重试) and had none. */
  transition: background 0.15s, transform 0.05s;
}

.button:hover { background: rgba(255, 255, 255, 0.25); }
.button:active { transform: translateY(1px); }
.button:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
.button:disabled { opacity: 0.5 }
.button:disabled:hover { background: rgba(255, 255, 255, 0.15); }

.room:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }

.error, .info {
  padding: 16px 0;
  font-size: clamp(12pt, 3.5vw, 14pt);
  font-family: var(--font-english);
}

.rooms {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* Long lists scroll inside the panel rather than running off a phone. */
  max-height: 50vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  margin: 8px 0;
}

.room {
  display: grid;
  /* Code and status take what they need; the names take the rest and ellipsize,
     so one long name cannot push the status off the row. */
  grid-template-columns: auto 1fr auto;
  align-items: baseline;
  gap: clamp(8px, 3vw, 20px);
  width: 100%;
  text-align: left;

  color: white;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.room:hover {
  background: rgba(255, 255, 255, 0.22);
}

.room-code {
  font-family: var(--font-english);
  font-weight: 600;
  font-size: clamp(13pt, 4vw, 17pt);
  letter-spacing: 2px;
}

.room-who {
  font-family: var(--font-chinese);
  font-size: clamp(11pt, 3vw, 13pt);
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-state {
  font-family: var(--font-chinese);
  font-size: clamp(10pt, 2.6vw, 12pt);
  opacity: 0.7;
  white-space: nowrap;
}

</style>
