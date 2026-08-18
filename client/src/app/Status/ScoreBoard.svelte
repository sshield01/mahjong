<script>
  import context from '../../game/context.js';

  const { store } = context();
</script>

{#if $store.scores && Object.keys($store.scores).length > 0}
  <div class="scoreboard">
    {#each Object.entries($store.scores).sort((a, b) => b[1] - a[1]) as [name, score]}
      <div class="score-row">
        <span class="name">{name}</span>
        <span class="score" class:positive={score > 0} class:negative={score < 0}>{score > 0 ? '+' : ''}{score}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .scoreboard {
    position: fixed;
    top: clamp(8px, 2vh, 10vh);
    left: clamp(8px, 3vw, 10vw);
    font-family: var(--font-chinese);
    font-size: clamp(10pt, 2.5vw, 14pt);
    color: white;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
    padding: 6px 10px;
  }

  .score-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 3px 0;
  }

  .positive {
    color: #4caf50;
  }

  .negative {
    color: #f44336;
  }
</style>
