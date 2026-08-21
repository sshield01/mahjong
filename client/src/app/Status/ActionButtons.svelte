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
    try {
      // On my own turn, "decline and proceed" must be a Draw vote, never a bare
      // Ignore -- Draw is the one vote the server always knows how to resolve.
      await socket.send($store.turn === myWind ? 'draw' : 'ignore');
    } catch (error) {
      console.log(error);
    }
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

  async function exposeWild() {
    try {
      await socket.send('exposeWildcard');
    } catch (error) {
      console.log(error);
    }
  }

  $: canExposeWildcard = $store && $store.drawn !== undefined && $store.turn === myWind &&
    $store.wildcard && $store[myWind].down.length > 0 &&
    eq($store.tiles[$store.drawn], $store.wildcard) &&
    $store[myWind].up.filter((t) => eq($store.tiles[t], $store.wildcard)).length >= 2;
</script>

<div class="container">
  <div class="actions">
    {#if $timer && !$currentVotes[myWind]}
      {#if !$timer.paused}
        <button class="action" on:click={wait}>
          Wait
        </button>
      {/if}
      <button class="action" on:click={cancel}>
        {$store.turn === myWind ? 'Draw' : 'Ignore'}
      </button>
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
      {#if canExposeWildcard}
        <button class="action" on:click={exposeWild}>
          亮
        </button>
      {/if}

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
    bottom: clamp(60px, 20vh, 50vh);
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
    margin: clamp(2px, 0.5vh, 6px);
    pointer-events: auto;
    font-size: clamp(14pt, 3.5vw, 18pt);
    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }
</style>
