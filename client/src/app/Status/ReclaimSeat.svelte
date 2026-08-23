<script>
  import context from '../../game/context.js';

  const { socket, store, myName, absent } = context();

  const CHARACTER = { Pei: '北', Nan: '南', Shaa: '西', Ton: '东' };

  // Only offered to someone not currently holding a seat -- a player who came
  // back without their saved session and is watching a game their own name is
  // still sitting in.
  $: seatsToReclaim = ['Ton', 'Nan', 'Shaa', 'Pei']
    .filter(position => $store[position] && $absent.has($store[position].name))
    .map(position => ({ position, name: $store[position].name }));

  let pending = null;
  let error = null;
  let busy = false;

  function open(seat) {
    pending = seat;
    error = null;
  }

  function close() {
    pending = null;
    error = null;
  }

  async function reclaim() {
    if (!pending || busy) return;
    busy = true;
    error = null;
    try {
      await socket.send('reclaimSeat', { name: pending.name });
      // The server answers with a fresh "start" carrying this seat's private
      // view, so the only thing left to fix up locally is who we now are.
      socket.name = pending.name;
      $myName = pending.name;
      localStorage.setItem('mahjong_name', pending.name);
      close();
    } catch (e) {
      error = typeof e === 'string' ? e : (e && e.message) || 'Could not take the seat.';
    } finally {
      busy = false;
    }
  }
</script>

{#if seatsToReclaim.length > 0}
  <div class="banner">
    <span class="label">断线：</span>
    {#each seatsToReclaim as seat}
      <button class="seat" on:click={() => open(seat)}>
        {CHARACTER[seat.position]} {seat.name}
      </button>
    {/each}
  </div>
{/if}

{#if pending}
  <div class="backdrop" on:click={close}></div>
  <div class="prompt">
    <div class="prompt-title">回到 {CHARACTER[pending.position]} 位</div>
    <div class="prompt-body">你是 <strong>{pending.name}</strong> 吗？</div>
    {#if error}
      <div class="prompt-error">{error}</div>
    {/if}
    <div class="prompt-buttons">
      <button class="prompt-button" on:click={close}>取消</button>
      <button class="prompt-button primary" disabled={busy} on:click={reclaim}>
        接管
      </button>
    </div>
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    left: 50%;
    bottom: clamp(20px, 5vh, 50px);
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 24px;
    background: rgba(0, 0, 0, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.25);
    white-space: nowrap;
  }

  .label {
    color: rgba(255, 255, 255, 0.75);
    font-family: var(--font-chinese);
    font-size: clamp(11pt, 3vw, 14pt);
  }

  .seat {
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.16);
    color: white;
    font-family: var(--font-english);
    font-weight: 600;
    font-size: clamp(11pt, 3vw, 14pt);
    padding: 5px 14px;
    cursor: pointer;
  }

  .seat:hover {
    background: rgba(173, 220, 145, 0.35);
  }

  .backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.55);
  }

  .prompt {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    width: min(320px, 80vw);
    padding: clamp(16px, 4vw, 24px);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 10px;
    background: rgba(20, 40, 26, 0.97);
    box-sizing: border-box;
  }

  .prompt-title {
    color: white;
    font-family: var(--font-chinese);
    font-size: clamp(14pt, 4vw, 18pt);
    text-align: center;
    margin-bottom: 10px;
  }

  .prompt-body {
    color: rgba(255, 255, 255, 0.85);
    font-family: var(--font-english);
    font-size: clamp(11pt, 3vw, 14pt);
    text-align: center;
  }

  .prompt-error {
    color: #ffb3b3;
    font-family: var(--font-english);
    font-size: clamp(10pt, 3vw, 12pt);
    padding-top: 10px;
    text-align: center;
  }

  .prompt-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 18px;
  }

  .prompt-button {
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.12);
    color: white;
    font-family: var(--font-chinese);
    font-size: clamp(12pt, 3.5vw, 14pt);
    padding: 8px 18px;
    cursor: pointer;
  }

  .prompt-button.primary {
    background: rgba(255, 255, 255, 0.9);
    color: #1c3b24;
  }

  .prompt-button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
