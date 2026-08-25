<script>
  import context from '../../game/context.js';
  import { updateSession } from '../../game/session.js';

  const { socket, store, myName, absent } = context();

  const CHARACTER = {
    Pei: '北',
    Nan: '南',
    Shaa: '西',
    Ton: '东',
  };

  export let order;
  export let mySeat = null;

  // Empty seats may be reserved during a hand; the server marks that player as
  // waiting and deals them in only once the next game begins.
  $: canPick = !mySeat;

  // A seated player who has asked for another game waits on whoever is still
  // reading the scoreboard, not on the host -- say which.
  $: seatedList = ['Ton', 'Nan', 'Shaa', 'Pei'].map(p => $store[p]).filter(Boolean);
  $: readyCount = seatedList.filter(p => p.ready).length;
  $: awaitingOthers = mySeat && readyCount > 0 && readyCount < seatedList.length;

  const NAME_KEY = 'mahjong_name';

  // With no entry page, the URL is the only place the room code appears -- and
  // mobile browsers hide the address bar, so surface it while in the lobby.
  const room = window.location.hash.slice(1);

  // Which seat the name prompt is for; null when the prompt is closed.
  let pending = null;
  let nameInput = '';
  let seatError = null;
  let sitting = false;

  // A seat still held by a player who dropped or stepped away. It is not free
  // for anyone else -- either its owner takes it back, or the host clears it.
  $: isAbsent = (position) => !!$store[position] && $absent.has($store[position].name);
  $: isWaiting = (position) => !!$store[position] && $store[position].waiting;
  $: isHost = !!$myName && $store.host === $myName;
  $: canReclaim = (position) => !mySeat && isAbsent(position);
  $: canManage = (position) =>
    isAbsent(position) && $store[position].name !== $myName;

  // Which absent seat the manage dialog is for; null when closed.
  let managing = null;
  let manageError = null;

  function openSeat(position) {
    if (isAbsent(position)) {
      managing = position;
      manageError = null;
      return;
    }
    pending = position;
    seatError = null;
    nameInput = localStorage.getItem(NAME_KEY) || '';
  }

  function closeManage() {
    managing = null;
    manageError = null;
  }

  async function reclaim() {
    const name = $store[managing].name;
    manageError = null;
    try {
      await socket.send('reclaimSeat', { name });
      socket.name = name;
      $myName = name;
      localStorage.setItem(NAME_KEY, name);
      rememberSession(name);
      closeManage();
    } catch (error) {
      manageError = typeof error === 'string' ? error : (error && error.message) || 'Could not take the seat.';
    }
  }

  async function kick() {
    manageError = null;
    try {
      await socket.send('kickPlayer', { position: managing });
      closeManage();
    } catch (error) {
      manageError = typeof error === 'string' ? error : (error && error.message) || 'Could not remove them.';
    }
  }

  function rememberSession(name) {
    updateSession({ name });
  }

  function closePrompt() {
    pending = null;
    seatError = null;
  }

  async function sit() {
    const name = nameInput.trim();
    if (!name || sitting) return;
    sitting = true;
    seatError = null;
    try {
      await socket.send('takeSeat', { position: pending, name });
      // The server now knows us by this name. `socket.name` is what the message
      // handler reads; `$myName` is what the UI resolves seats from.
      socket.name = name;
      $myName = name;
      localStorage.setItem(NAME_KEY, name);
      rememberSession(name);
      closePrompt();
    } catch (error) {
      seatError = typeof error === 'string' ? error : (error && error.message) || 'Could not sit down.';
    } finally {
      sitting = false;
    }
  }

  function onKey(event) {
    if (event.key === 'Enter') sit();
    else if (event.key === 'Escape') closePrompt();
  }
</script>

<!-- `order` arrives as [across, right, left, near] relative to the viewer, so the
     seats sit where those players actually are around the table. -->
<div class="seats">
  {#each order as position, i}
    <div
      class="seat {['across', 'right', 'left', 'near'][i]}
             {$store[position] ? 'taken' : 'empty'}
             {(canPick && !$store[position]) || canReclaim(position) || (isHost && canManage(position)) ? 'open' : ''}"
      on:click={() => ((canPick && !$store[position]) || canReclaim(position) || (isHost && canManage(position))) && openSeat(position)}
    >
      <span class="wind">{CHARACTER[position]}</span>
      {#if $store[position]}
        <span class="name {isAbsent(position) ? 'away' : ''}">{$store[position].name}</span>
        <span class="tags">
          {#if $store.host === $store[position].name}<span class="tag host">房主</span>{/if}
          {#if isAbsent(position)}<span class="tag away-tag">断线</span>{/if}
          {#if isWaiting(position)}<span class="tag ready-tag">下一局</span>{/if}
          {#if $store[position].ready}<span class="tag ready-tag">已准备</span>{/if}
        </span>
      {:else}
        <span class="vacant">空位</span>
      {/if}
    </div>
  {/each}
</div>

{#if room}
  <div class="room-code">房间 {room}</div>
{/if}

{#if !pending}
  <!-- A seated player's own name card sits at the bottom centre (the `.near`
       seat), and so does this hint -- lift it above the card so the two do not
       overlap. A spectator picking a seat has no card there, so its hint stays
       at the bottom. -->
  {#if canPick}
    <div class="hint">点一个空位坐下</div>
  {:else if awaitingOthers}
    <div class="hint above-seat">
      等待其他玩家 ({readyCount}/{seatedList.length})
    </div>
  {:else if mySeat && isWaiting(mySeat)}
    <div class="hint above-seat">已入座，下一局开始</div>
  {:else if mySeat && $store.host !== $myName}
    <div class="hint above-seat">等待房主开始</div>
  {/if}
{/if}

{#if pending}
  <div class="prompt-backdrop" on:click={closePrompt}></div>
  <div class="prompt">
    <div class="prompt-title">坐 {CHARACTER[pending]} 位</div>
    <input
      class="prompt-input"
      placeholder="你的名字"
      maxlength="20"
      bind:value={nameInput}
      on:keydown={onKey}
      autofocus
    />
    {#if seatError}
      <div class="prompt-error">{seatError}</div>
    {/if}
    <div class="prompt-buttons">
      <button class="prompt-button" on:click={closePrompt}>取消</button>
      <button class="prompt-button primary" disabled={!nameInput.trim() || sitting} on:click={sit}>
        坐下
      </button>
    </div>
  </div>
{/if}

{#if managing}
  <div class="prompt-backdrop" on:click={closeManage}></div>
  <div class="prompt">
    <div class="prompt-title">{CHARACTER[managing]} 位 · {$store[managing].name}</div>
    <div class="prompt-body">这位玩家已断线</div>
    {#if manageError}
      <div class="prompt-error">{manageError}</div>
    {/if}
    <div class="prompt-buttons">
      <button class="prompt-button" on:click={closeManage}>取消</button>
      {#if isHost}
        <button class="prompt-button danger" on:click={kick}>移出</button>
      {/if}
      {#if canReclaim(managing)}
        <button class="prompt-button primary" on:click={reclaim}>我是本人</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Seats sit where the players actually are, rather than as wedges of a rotated
     diamond -- upright text, room for a name and its badges, and an obvious
     mapping between a card and the chair it stands for. */
  .seats {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
  }

  .seat {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: clamp(96px, 22vw, 168px);
    padding: clamp(8px, 1.6vh, 14px) clamp(10px, 2vw, 18px);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.55);
    pointer-events: auto;
  }

  .near   { left: 50%; bottom: clamp(84px, 16vh, 150px); transform: translateX(-50%); }
  .across { left: 50%; top: clamp(52px, 10vh, 110px);    transform: translateX(-50%); }
  .left   { left: clamp(8px, 4vw, 64px);  top: 50%; transform: translateY(-50%); }
  .right  { right: clamp(8px, 4vw, 64px); top: 50%; transform: translateY(-50%); }

  .seat.empty {
    border-style: dashed;
    background: rgba(0, 0, 0, 0.35);
  }

  .seat.open {
    cursor: pointer;
    border-color: rgba(173, 220, 145, 0.8);
    background: rgba(30, 60, 38, 0.8);
  }

  .seat.open:hover {
    border-color: rgba(173, 220, 145, 1);
    background: rgba(45, 85, 55, 0.9);
  }

  .wind {
    font-family: var(--font-chinese);
    font-size: clamp(15pt, 4vw, 22pt);
    line-height: 1.1;
    color: rgba(255, 255, 255, 0.9);
  }

  .name {
    font-family: var(--font-english);
    font-size: clamp(11pt, 3vw, 15pt);
    font-weight: 600;
    color: white;
    max-width: clamp(96px, 22vw, 168px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A held-but-empty seat: dimmed so it reads as "not here" rather than "free". */
  .name.away {
    opacity: 0.55;
    font-style: italic;
  }

  .vacant {
    font-family: var(--font-chinese);
    font-size: clamp(10pt, 2.6vw, 13pt);
    color: rgba(255, 255, 255, 0.6);
  }

  .tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .tag {
    font-family: var(--font-chinese);
    font-size: clamp(8pt, 2vw, 10pt);
    line-height: 1.4;
    padding: 0 6px;
    border-radius: 8px;
  }

  .tag.host     { background: rgba(255, 255, 255, 0.2); color: white; }
  .tag.away-tag { background: rgba(244, 67, 54, 0.35); color: #ffd6d6; }
  .tag.ready-tag{ background: rgba(173, 220, 145, 0.35); color: #dff5cf; }

  .room-code {
    position: fixed;
    left: 50%;
    top: clamp(8px, 2vh, 20px);
    transform: translateX(-50%);
    color: rgba(255, 255, 255, 0.7);
    font-family: var(--font-chinese);
    font-size: clamp(11pt, 3vw, 14pt);
    letter-spacing: 2px;
    white-space: nowrap;
    pointer-events: none;
  }

  /* Sits above the viewer's own name card (the `.near` seat), whose own bottom
     offset is clamp(84px, 16vh, 150px); clear its height on top of that so the
     hint and the name never overlap. */
  .hint.above-seat {
    bottom: calc(clamp(84px, 16vh, 150px) + 96px);
  }

  .hint {
    position: fixed;
    left: 50%;
    bottom: clamp(20px, 5vh, 50px);
    transform: translateX(-50%);
    color: rgba(255, 255, 255, 0.75);
    font-family: var(--font-chinese);
    font-size: clamp(12pt, 3.5vw, 15pt);
    white-space: nowrap;
    pointer-events: none;
  }

  .prompt-backdrop {
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
    margin-bottom: 12px;
    text-align: center;
  }

  .prompt-input {
    font-size: clamp(14pt, 4vw, 16pt);
    border: none;
    background: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.3);
    padding: 10px 0;
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

  .prompt-button.danger {
    border-color: rgba(255, 140, 140, 0.6);
    color: #ffb3b3;
  }

  .prompt-body {
    color: rgba(255, 255, 255, 0.85);
    font-family: var(--font-chinese);
    font-size: clamp(11pt, 3vw, 14pt);
    text-align: center;
    padding-top: 6px;
  }

  .prompt-button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
