<script>
  import context from '../../game/context.js';

  const { socket, store, myName } = context();

  const MINIMUM_PLAYERS = 2;

  // Only the host sees this, so it is the single control that starts the table --
  // no per-player ready step.
  $: seated = ['Ton', 'Nan', 'Shaa', 'Pei'].filter(position => $store[position]).length;
  $: enough = seated >= MINIMUM_PLAYERS;

  let starting = false;
  let error = null;

  async function start() {
    if (!enough || starting) return;
    starting = true;
    error = null;
    try {
      await socket.send('startGame');
    } catch (e) {
      error = typeof e === 'string' ? e : (e && e.message) || 'Could not start.';
    } finally {
      starting = false;
    }
  }
</script>

<button class='button' disabled={!enough || starting} on:click={start}>
  {#if error}
    {error}
  {:else if enough}
    开始
  {:else}
    等待玩家入座
  {/if}
</button>

<style>
  .button {
    position: fixed;
    left: 50%;
    bottom: clamp(20px, 5vh, 50px);
    width: min(300px, 70vw);
    height: 50px;
    transform: translateX(-50%);

    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 28px;
    background: rgba(0, 0, 0, 0.7);
    font-family: var(--font-chinese);
    font-size: clamp(14pt, 4vw, 16pt);
    color: white;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  /* Enabled it is the primary action of the lobby, so it earns the accent on
     hover rather than the dark pill it wears at rest -- and press feedback it
     had none of before. */
  .button:not(:disabled):hover {
    background: rgba(45, 85, 55, 0.9);
    border-color: var(--green);
  }

  .button:not(:disabled):active {
    transform: translateX(-50%) translateY(1px);
  }

  .button:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }

  .button:disabled {
    opacity: 0.55;
    cursor: default;
  }
</style>
