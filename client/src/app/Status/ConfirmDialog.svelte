<script>
  import context from '../../game/context.js';

  const { pendingConfirm } = context();

  // Enter confirms, Escape cancels -- so the dialog can be answered from the
  // keyboard as well as by tapping, matching the seat prompt's behaviour.
  function onKey(event) {
    if (!$pendingConfirm) return;
    if (event.key === 'Enter') $pendingConfirm.answer(true);
    else if (event.key === 'Escape') $pendingConfirm.answer(false);
  }
</script>

<svelte:window on:keydown={onKey} />

{#if $pendingConfirm}
  <div class="mj-backdrop" on:click={() => $pendingConfirm.answer(false)}></div>
  <div class="mj-card">
    <div class="mj-body">{$pendingConfirm.message}</div>
    <div class="mj-buttons">
      <button class="mj-btn" on:click={() => $pendingConfirm.answer(false)}>取消</button>
      <button class="mj-btn mj-btn--primary" on:click={() => $pendingConfirm.answer(true)}>
        确定
      </button>
    </div>
  </div>
{/if}

<!-- Card, backdrop and buttons are the shared shell in index.html (.mj-*), so
     every "are you sure?" in the app wears one dark-green card rather than a
     native browser dialog or a per-component copy of the same CSS. -->
