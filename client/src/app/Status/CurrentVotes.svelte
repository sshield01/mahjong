<script>
  import context from '../../game/context.js';

  const { store, currentVotes, timer } = context();
</script>

{#if $timer}
  <div class='votes'>
      {#each Object.entries($currentVotes) as [position, vote]}
        {#if vote && vote.method !== 'Discard' && vote.method !== 'Ignore'}
          <div class='vote'>
            {$store[position].name}: {vote.method}
          </div>
        {/if}
      {/each}
  </div>
{/if}

<style>
  .votes {
    pointer-events: none;
    position: fixed;
    bottom: clamp(8px, 2vh, 32px);
    right: clamp(8px, 3vw, 32px);

    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .vote {
    white-space: nowrap;
    font-size: clamp(12pt, 3.5vw, 18pt);
    color: white;
    font-family: var(--font-english);
  }
</style>
