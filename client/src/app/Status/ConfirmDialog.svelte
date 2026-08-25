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
  <div class="prompt-backdrop" on:click={() => $pendingConfirm.answer(false)}></div>
  <div class="prompt">
    <div class="prompt-body">{$pendingConfirm.message}</div>
    <div class="prompt-buttons">
      <button class="prompt-button" on:click={() => $pendingConfirm.answer(false)}>取消</button>
      <button class="prompt-button primary" on:click={() => $pendingConfirm.answer(true)}>
        确定
      </button>
    </div>
  </div>
{/if}

<style>
  /* Matches the seat prompt in PlayerList.svelte, so every "are you sure?" in
     the app wears the same dark-green card rather than a native browser dialog. */
  .prompt-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.55);
    z-index: 10;
  }

  .prompt {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    width: min(340px, 82vw);
    padding: clamp(16px, 4vw, 24px);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 10px;
    background: rgba(20, 40, 26, 0.97);
    box-sizing: border-box;
    z-index: 11;
  }

  .prompt-body {
    color: rgba(255, 255, 255, 0.9);
    font-family: var(--font-chinese);
    font-size: clamp(12pt, 3.5vw, 15pt);
    line-height: 1.5;
    text-align: center;
  }

  .prompt-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
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
</style>
