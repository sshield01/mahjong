<script>
  import TextTile from './TextTile.svelte';
  import Schema, { eq } from '../../lib/schema.js';
  import context from '../../game/context.js';

  const {
    currentVotes,
    selection,
    selectionSets,
    socket,
    store,
    hasAction,
    timer,
  } = context();

  let actions = []
  $: actions = $selectionSets
    .filter(selectionSet => {
      return selectionSet.tiles.every(tile => $selection.has(tile)) &&
        selectionSet.tiles.length === $selection.size;
    });

  $: myWind = $store && $store.playerWind(socket.name);
  $: isWild = (t) => $store.wildcard && eq(t, $store.wildcard);
  $: concealedKongs = $store[myWind].up
    .filter((tile, i, tiles) =>
      !isWild($store.tiles[tile]) &&
      tiles
        .slice(i + 1)
        .map(tile => $store.tiles[tile])
        .filter(info => eq(info, $store.tiles[tile]))
        .length === 3
    );
  $: exposedKongs = $store[myWind].up
    .filter(tile =>
      !isWild($store.tiles[tile]) &&
      $store[myWind].down
        .filter(meld => meld.length === 3)
        .some(meld => meld
          .map(tile => $store.tiles[tile])
          .every(info => eq(info, $store.tiles[tile]))
        )
    );

  function wait() {
    $timer.paused = Date.now();
    if ($timer.handle) {
      window.clearTimeout($timer.handle);
      $timer.handle = false;
    }
  }

  async function cancel() {
    await socket.send('ignore');
  }

  async function kong(mode, tile) {
    try {
      await socket.send('kong', { mode, tile });
    } catch (error) {
      console.log(error);
    }
  }

  async function win() {
    try {
      await socket.send('declare');
    } catch (error) {
      console.log(error);
    }
  }
</script>

<div class="container">
  <div class="actions">
    {#if $hasAction && $timer && !$currentVotes[myWind]}
      {#if $timer.paused}
        <button class="action" on:click={cancel}>
          Cancel Wait
        </button>
      {:else}
        <button class="action" on:click={wait}>
          Wait
        </button>
      {/if}
    {/if}
    
    {#each actions as action}
      <button class="action" on:click={action.handler}>
        {action.label}
      </button>
    {/each}

    {#if $store && Schema.winningHand($store, $store[myWind]) && $store.turn === myWind}
      <button class="action" on:click={win}>
        胡
      </button>
    {/if}

    {#if $store && $store.drawn !== undefined && $store.turn === myWind}
      {#each concealedKongs as tile}
        <button class="action" on:click={() => kong('concealed', tile)}>
          杠 (<TextTile {tile} />)
        </button>
      {/each}

      {#each exposedKongs as tile}
        <button class="action" on:click={() => kong('augmented', tile)}>
          杠 (<TextTile {tile} />)
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
  }
    
  .actions {
    position: absolute;
    bottom: clamp(10px, 3vh, 50px);
    left: clamp(10px, 3vw, 50px);

    display: flex;
    flex-direction: column;
    min-width: 80px;
    pointer-events: none;
  }

  .action {
    background-color: rgb(255, 255, 255);
    border: rgba(255, 255, 255, 0.75);
    border-radius: 6px;
    padding: clamp(6px, 1.5vh, 8px) clamp(10px, 2vw, 16px);
    margin: clamp(4px, 1vh, 16px);
    pointer-events: auto;
    font-size: clamp(14pt, 3.5vw, 18pt);
    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }
</style>
