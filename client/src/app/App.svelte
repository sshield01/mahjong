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
  import context, { init } from '../game/context.js';

  export let socket;

  init(socket);
  const ctx = context();
  const { store } = ctx;

  let name;
  let errorMessage;

  const PLAY = Symbol();
  const CREATE = Symbol();
  const JOIN = Symbol();

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

  async function enterRoom(room) {
    if (!name) return;
    errorMessage = undefined;

    try {
      await socket.send('identification', { name });
      socket.name = name;
    } catch (error) {
      errorMessage = error;
      return;
    }

    try {
      const { schema, token } = await socket.send('location', { room });
      if (token) {
        localStorage.setItem('mahjong_session', JSON.stringify({ token, name, room }));
      }
      window.location.hash = room;
      handler(schema, ctx);
      state = PLAY;
    } catch (error) {
      errorMessage = error;
    }
  }

  function create() {
    enterRoom(generateRoom());
  }

  function join() {
    enterRoom(getRoomFromUrl());
  }

  let state = null;

  async function tryReconnect() {
    const saved = localStorage.getItem('mahjong_session');
    if (!saved) {
      state = getRoomFromUrl() ? JOIN : CREATE;
      return;
    }
    try {
      const { token } = JSON.parse(saved);
      const result = await socket.send('reconnect', { token });
      socket.name = result.name;
      name = result.name;
      window.location.hash = result.room;
      handler(result.schema, ctx);
      state = PLAY;
    } catch (error) {
      localStorage.removeItem('mahjong_session');
      state = getRoomFromUrl() ? JOIN : CREATE;
    }
  }

  tryReconnect();

  function submit(event) {
    if (event.key == 'Enter') {
      if (state === CREATE) create();
      else if (state === JOIN) join();
    }
  }

  let adjustment = 0;
  $: tableAngle = Math.min(90, Math.max(0, 60 + adjustment));
  const SPEED = 3;
  function scroll(event) {
    if (state !== PLAY) return;
    const direction = event.deltaY / Math.abs(event.deltaY);
    if (tableAngle + direction * SPEED <= 90 && tableAngle + direction * SPEED >= 0) {
      adjustment += direction * SPEED;
    }
  }

  function resetAngle() {
    if (state !== PLAY) return;
    adjustment = 0;
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
      const newAngle = 60 + adjustment + delta * 0.5;
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

<svelte:window on:wheel={scroll} on:dblclick={resetAngle} on:touchstart={touchstart} on:touchmove={touchmove} on:touchend={touchend} />
<div class="layer full">
  <Table
    angle={state === PLAY ? tableAngle : 0}
    rotation={$store ? ['Ton', 'Nan', 'Shaa', 'Pei'].indexOf($store.playerWind(name)) * 90 : 0}
    bottomLabel={$store && $store.Ton && $store.Ton.name}
    topLabel={$store && $store.Shaa && $store.Shaa.name}
    rightLabel={$store && $store.Nan && $store.Nan.name}
    leftLabel={$store && $store.Pei && $store.Pei.name}
    highlightSide={SIDE[$store && $store.turn] || null}
    >
    <Tiles {tableAngle} />
  </Table>
</div>

{#if state === PLAY}
  <div class="layer">
    <Status />
  </div>
{:else if state === CREATE || state === JOIN}
  <div class="layer full title">
    <Title>
      <div class="form">
        <input class="input" placeholder="Name" bind:value={name} on:keydown={submit} autofocus tabindex='1' />
        {#if state === CREATE}
          <button class="button" disabled={!name} on:click={create}>Create Room</button>
        {:else}
          <button class="button" disabled={!name} on:click={join}>Join Room</button>
        {/if}
        {#if errorMessage}
          <div class="error">{errorMessage}</div>
        {/if}
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

.title, .input, .button {
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

.input {
  font-size: clamp(14pt, 4vw, 16pt);
  border: none;
  background: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.25);
  padding: 12px 0;

  font-family: var(--font-english);
  width: 100%;
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
}

.button:disabled { opacity: 0.5 }

.error, .info {
  padding: 16px 0;
  font-size: clamp(12pt, 3.5vw, 14pt);
  font-family: var(--font-english);
}

</style>
