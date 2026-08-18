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

  let name, room;
  let errorMessage;

  const PLAY = Symbol();

  async function location() {
    if (!room) { return; }
    errorMessage = undefined;

    try {
      const { schema } = await socket.send('location', { room });
      handler(schema, ctx);
      state = PLAY;
    } catch (error) {
      console.log(error);
      errorMessage = error;
    }
  }

  async function identification() {
    if (!name) { return; }
    errorMessage = undefined;

    try {
      await socket.send('identification', { name });
      socket.name = name;
      state = location;
    } catch (error) {
      errorMessage = error;
    }
  }

  let state = identification;

  function submit(event) {
    if (event.key == 'Enter') {
      state();
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
{:else}
  <div class="layer full title">
    <Title>
      <div class="form">
        {#if state === identification}
          <input class="input" placeholder="Enter your name" bind:value={name} on:keydown={submit} autofocus tabindex='1' />
          <button class="button" disabled={!name} on:click={() => state()}>Confirm</button>
        {/if}
        {#if state === location}
          <div class="info">Welcome, <b>{name}</b>.</div>
          <input class="input" placeholder="Enter a game name" bind:value={room} on:keydown={submit} autofocus tabindex='1' />
          <button class="button" disabled={!room} on:click={() => state()}>Confirm</button>
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
