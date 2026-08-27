<script context="module">
  import { readable } from 'svelte/store';

  const time = readable(Date.now(), (set) => {
    function update() {
      set(Date.now());
      window.requestAnimationFrame(update);
    }
    window.requestAnimationFrame(update);
  });
</script>

<script>
  import context from '../../game/context.js';

  const { timer } = context();

  // The clock is only ever armed for this player, and only when they hold a claim
  // to decide on -- so a bare bar left them guessing whose it was and what it
  // wanted. Say it: this is your decision, and here is how long is left. Frozen
  // at the paused time once 想想 stops the countdown.
  $: elapsed = $timer ? ($timer.paused || $time) - $timer.start : 0;
  $: remaining = $timer ? Math.max(0, Math.ceil(($timer.duration - elapsed) / 1000)) : 0;
</script>

{#if $timer}
  <div
    class="timer"
    class:paused={$timer.paused}
    style='width: {Math.min(100, elapsed / $timer.duration * 100)}vw;' />
  <div class="label" class:paused={$timer.paused}>
    {$timer.paused ? '等你决定 · 已暂停' : `等你决定 · ${remaining}`}
  </div>
{/if}

<style>
  .timer {
    position: absolute;
    top: 0;
    left: 0;
    height: 16px;
    background-color: #89abe3;
    pointer-events: none;
  }

  .timer.paused {
    background-color: #7bc77e;
  }

  /* Left-aligned, clear of the discard indicator that sits at top-centre. */
  .label {
    position: fixed;
    top: 22px;
    left: clamp(8px, 3vw, 32px);
    padding: 2px 10px;
    border-radius: 10px;
    background: rgba(137, 171, 227, 0.9);
    color: white;
    font-family: var(--font-chinese);
    font-size: clamp(11pt, 3vw, 14pt);
    white-space: nowrap;
    pointer-events: none;
  }

  .label.paused {
    background: rgba(123, 199, 126, 0.9);
  }
</style>
