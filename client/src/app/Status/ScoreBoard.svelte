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
    /* Sans rather than the brush face: this is read at a glance mid-hand, and
       Long Cang's digits are hard to pick apart at small sizes. */
    font-family: var(--font-english);
    font-size: clamp(12pt, 3vw, 17pt);
    color: white;
    background: rgba(0, 0, 0, 0.55);
    border-radius: 8px;
    padding: clamp(6px, 1.2vh, 10px) clamp(10px, 2vw, 16px);
  }

  .score-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: clamp(12px, 3vw, 24px);
    margin: clamp(3px, 0.6vh, 6px) 0;
  }

  .name {
    font-weight: 600;
  }

  .score {
    font-weight: 600;
    /* Equal-width digits keep the column steady as scores change. */
    font-variant-numeric: tabular-nums;
  }

  .positive {
    color: #4caf50;
  }

  .negative {
    color: #f44336;
  }
</style>
