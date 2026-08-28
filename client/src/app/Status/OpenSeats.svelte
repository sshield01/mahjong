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
  <div class="mj-backdrop" on:click={close}></div>
  <div class="mj-card">
    <div class="mj-title">坐 {CHARACTER[pending]} 位</div>
    <div class="mj-note">本局已开始，下一局入座</div>
    <input
      class="mj-input"
      placeholder="你的名字"
      maxlength="20"
      bind:value={nameInput}
      on:keydown={onKey}
      autofocus
    />
    {#if error}
      <div class="mj-error">{error}</div>
    {/if}
    <div class="mj-buttons">
      <button class="mj-btn" on:click={close}>取消</button>
      <button class="mj-btn mj-btn--primary" disabled={!nameInput.trim() || sitting} on:click={sit}>
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

  /* Shared with the 断线 banner's chip in ReclaimSeat -- same element, so the
     same look. Chinese font here since it shows a wind character; ReclaimSeat
     shows a name and switches to the Latin face, which is the only difference. */
  .seat {
    border: 1px solid var(--green);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.16);
    color: white;
    font-family: var(--font-chinese);
    font-weight: 600;
    font-size: clamp(11pt, 3vw, 14pt);
    padding: 5px 14px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .seat:hover {
    background: rgba(173, 220, 145, 0.35);
  }

  .seat:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
</style>
