<script>
  import context from '../../game/context.js';

  const { socket, myName, absent } = context();

  $: away = !!$myName && $absent.has($myName);

  let busy = false;

  async function toggle() {
    if (busy) return;
    busy = true;
    try {
      await socket.send(away ? 'returnSeat' : 'leaveSeat');
    } catch (error) {
      console.error(error);
    } finally {
      busy = false;
    }
  }
</script>

<button class="leave {away ? 'away' : ''}" disabled={busy} on:click={toggle}>
  {#if away}
    我回来了
  {:else}
    暂离
  {/if}
</button>

{#if away}
  <div class="away-note">暂离中，系统代打</div>
{/if}

<style>
  .leave {
    position: fixed;
    right: clamp(8px, 3vw, 10vw);
    bottom: clamp(8px, 2vh, 20px);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 20px;
    background: rgba(0, 0, 0, 0.6);
    color: rgba(255, 255, 255, 0.8);
    font-family: var(--font-chinese);
    font-size: clamp(11pt, 3vw, 14pt);
    padding: 6px 16px;
    cursor: pointer;
  }

  .leave:hover {
    background: rgba(0, 0, 0, 0.8);
    color: white;
  }

  /* Coming back is the urgent action once away, so it stops being subtle. */
  .leave.away {
    background: rgba(173, 220, 145, 0.9);
    color: #1c3b24;
    border-color: rgba(173, 220, 145, 1);
    font-weight: bold;
  }

  .leave:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .away-note {
    position: fixed;
    right: clamp(8px, 3vw, 10vw);
    bottom: calc(clamp(8px, 2vh, 20px) + 40px);
    color: rgba(255, 255, 255, 0.75);
    font-family: var(--font-chinese);
    font-size: clamp(10pt, 2.5vw, 12pt);
    white-space: nowrap;
    pointer-events: none;
  }
</style>
