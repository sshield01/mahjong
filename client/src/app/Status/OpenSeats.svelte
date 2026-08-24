<script>
  import context from '../../game/context.js';
  import { updateSession } from '../../game/session.js';

  const { socket, store, myName } = context();

  const CHARACTER = { Pei: '北', Nan: '南', Shaa: '西', Ton: '东' };
  const NAME_KEY = 'mahjong_name';

  // The seat diamond is only mounted before a hand starts, so mid-hand there was
  // nowhere at all to ask for a chair -- a spectator arriving at a three-handed
  // table watched an empty seat they could not take, and `takeSeat` was reachable
  // only over the socket. Same shape as the 断线 banner beside this one, because
  // it answers the same question: which seats are open to me right now.
  //
  // Sitting down here reserves the seat rather than joining the hand in progress:
  // the deal has already happened. The server marks it `waiting` and deals them
  // in when the next game begins, which is what the note in the prompt says.
  $: openSeats = ['Ton', 'Nan', 'Shaa', 'Pei'].filter(position => !$store[position]);

  let pending = null;
  let nameInput = '';
  let error = null;
  let sitting = false;

  function open(position) {
    pending = position;
    error = null;
    nameInput = localStorage.getItem(NAME_KEY) || '';
  }

  function close() {
    pending = null;
    error = null;
  }

  async function sit() {
    const name = nameInput.trim();
    if (!name || sitting) return;
    sitting = true;
    error = null;
    try {
      await socket.send('takeSeat', { position: pending, name });
      // The server knows us by this name now. `socket.name` is what the message
      // handler reads; `$myName` is what the UI resolves seats from.
      socket.name = name;
      $myName = name;
      localStorage.setItem(NAME_KEY, name);
      updateSession({ name });
      close();
    } catch (e) {
      error = typeof e === 'string' ? e : (e && e.message) || 'Could not sit down.';
    } finally {
      sitting = false;
    }
  }

  function onKey(event) {
    if (event.key === 'Enter') sit();
    else if (event.key === 'Escape') close();
  }
</script>

{#if openSeats.length > 0}
  <div class="banner">
    <span class="label">空位：</span>
    {#each openSeats as position}
      <button class="seat" on:click={() => open(position)}>
        {CHARACTER[position]}
      </button>
    {/each}
  </div>
{/if}

{#if pending}
  <div class="backdrop" on:click={close}></div>
  <div class="prompt">
    <div class="prompt-title">坐 {CHARACTER[pending]} 位</div>
    <div class="prompt-body">本局已开始，下一局入座</div>
    <input
      class="prompt-input"
      placeholder="你的名字"
      maxlength="20"
      bind:value={nameInput}
      on:keydown={onKey}
      autofocus
    />
    {#if error}
      <div class="prompt-error">{error}</div>
    {/if}
    <div class="prompt-buttons">
      <button class="prompt-button" on:click={close}>取消</button>
      <button class="prompt-button primary" disabled={!nameInput.trim() || sitting} on:click={sit}>
        坐下
      </button>
    </div>
  </div>
{/if}

<style>
  /* Sits one row above the 断线 banner, which uses the same bottom anchor. Both
     can be on screen at once -- a table can have a dropped player and an empty
     chair -- and the offset is unconditional so the two never land on top of
     each other while one of them is still deciding whether to render. */
  .banner {
    position: fixed;
    left: 50%;
    bottom: calc(clamp(20px, 5vh, 50px) + 52px);
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
    border: 1px solid rgba(173, 220, 145, 0.6);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.16);
    color: white;
    font-family: var(--font-chinese);
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
    margin-bottom: 6px;
  }

  .prompt-body {
    color: rgba(255, 255, 255, 0.7);
    font-family: var(--font-chinese);
    font-size: clamp(10pt, 2.8vw, 12pt);
    text-align: center;
  }

  .prompt-input {
    font-size: clamp(14pt, 4vw, 16pt);
    border: none;
    background: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.3);
    padding: 10px 0;
    margin-top: 8px;
    color: white;
    font-family: var(--font-english);
    width: 100%;
    box-sizing: border-box;
  }

  .prompt-input:focus {
    outline: none;
    border-bottom-color: rgba(255, 255, 255, 0.8);
  }

  .prompt-error {
    color: #ffb3b3;
    font-family: var(--font-english);
    font-size: clamp(10pt, 3vw, 12pt);
    padding-top: 10px;
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
