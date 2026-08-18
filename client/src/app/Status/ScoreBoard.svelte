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
    top: 10vh;
    left: 10vw;
    font-family: var(--font-chinese);
    font-size: 14pt;
    color: white;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
    padding: 8px 12px;
  }

  .score-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin: 4px 0;
  }

  .positive {
    color: #4caf50;
  }

  .negative {
    color: #f44336;
  }
</style>
