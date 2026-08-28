<script>
  import TextTile from './TextTile.svelte';
  import Schema, { eq } from '../../lib/schema.js';
  import context from '../../game/context.js';
  import { confirmWildcards } from '../../game/wildcards.js';

  const {
    currentVotes,
    selection,
    selectionSets,
    socket,
    store,
    timer,
    myName,
    confirm,
  } = context();

  let actions = []
  $: actions = $selectionSets
    .filter(selectionSet => {
      return selectionSet.tiles.every(tile => $selection.has(tile)) &&
        selectionSet.tiles.length === $selection.size;
    });

  // This component is only mounted for a seated player, but guard `myWind`
  // being falsy anyway (e.g. a spectator) rather than throwing on $store[myWind].
  $: myWind = $store && $store.seatOf($myName);
  $: isWild = (t) => $store.wildcard && eq(t, $store.wildcard);

  // No kong once the hand is down to its last lap -- the replacement would come
  // from the back of the wall, which is the only part still standing, and the
  // 海底 round is counted out of what is left in front of it. The server refuses
  // it, so offering the button would only produce a rejection nobody asked for.
  $: kongsAllowed = !!$store && $store.started && !$store.completed && !$store.finalRound();

  $: concealedKongs = (myWind && kongsAllowed) ? $store[myWind].up
    .filter((tile, i, tiles) =>
      !isWild($store.tiles[tile]) &&
      tiles
        .slice(i + 1)
        .map(tile => $store.tiles[tile])
        .filter(info => eq(info, $store.tiles[tile]))
        .length === 3
    ) : [];
  $: exposedKongs = (myWind && kongsAllowed) ? $store[myWind].up
    .filter(tile =>
      !isWild($store.tiles[tile]) &&
      $store[myWind].down
        .filter(meld => meld.length === 3)
        .some(meld => meld
          .map(tile => $store.tiles[tile])
          .every(info => eq(info, $store.tiles[tile]))
        )
    ) : [];

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
    // 杠 is the action here that spends the concealment a regular 胡 depends on.
    // 胡 does not warn: `canDeclare` below is `winningHand` already agreeing this
    // is a win, and that check applies the two-wildcard rule itself.
    if (!(await confirmWildcards(confirm, $store, myWind))) return;
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

  // `$timer` is the single signal here: the discard handler only arms it for a
  // non-turn player who actually holds a claim, so seats with nothing to decide
  // stay button-free. `wait()` keeps the timer object and only clears its handle,
  // so 过 survives pausing -- a claim holder must always be able to pass, or the
  // round waits on their vote forever.
  $: canVote = $timer && myWind && !$currentVotes[myWind];

  // Has another seat already claimed this discard? Once one has, the round is
  // waiting on this seat alone, and 想想 stops this seat's clock with nothing
  // left to start it again -- the claimer's 碰 would then sit there looking
  // broken until the turn player happened to draw. Thinking time is for while
  // the table is still deciding; after a claim has landed, answer or pass.
  $: someoneElseClaimed = Object.entries($currentVotes).some(
    ([position, vote]) =>
      position !== myWind && vote &&
      vote.method !== 'Discard' && vote.method !== 'Ignore' && vote.method !== 'Draw',
  );

  // Melds you build on your own turn, off the tile you just drew.
  $: canMeld = $store && $store.drawn !== undefined && $store.turn === myWind;

  $: canDeclare = $store && myWind && $store.turn === myWind &&
    Schema.winningHand($store, $store[myWind]);

  $: canExposeWildcard = canMeld &&
    $store.wildcard && $store[myWind].down.length > 0 &&
    eq($store.tiles[$store.drawn], $store.wildcard) &&
    $store[myWind].up.filter((t) => eq($store.tiles[t], $store.wildcard)).length >= 2;

  // Whether this palette currently holds anything. It overlays the bottom-left
  // of the table, which is where your own hand sits -- and every tile in it is a
  // live discard target on exactly the turns these buttons appear on. Leaving the
  // column click-through meant a tap landing in the gap beside 杠 fell past it
  // onto a tile and discarded it, which reads as the button doing the discarding.
  // So the column swallows clicks while it has buttons, and goes back to being
  // transparent to them when it is empty.
  $: hasButtons = !!(canVote || actions.length || canDeclare ||
    (canMeld && (canExposeWildcard || concealedKongs.length || exposedKongs.length)));
</script>

<div class="container">
  <div class="actions" class:live={hasButtons}>
    {#if canVote}
      {#if !$timer.paused && !someoneElseClaimed}
        <button class="action" on:click={wait}>
          想想
        </button>
      {/if}
      <button class="action" on:click={cancel}>
        {$store.turn === myWind ? '摸' : '过'}
      </button>
    {/if}
    
    {#each actions as action}
      <button class="action" class:win={action.win} on:click={action.handler}>
        {action.label}
      </button>
    {/each}

    {#if canDeclare}
      <button class="action win" on:click={win}>
        胡
      </button>
    {/if}

    {#if canMeld}
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

  .actions.live {
    pointer-events: auto;
  }

  /* The most-pressed control in the game, and the least finished until now: it
     carried no font (so 碰/杠/吃 fell back to sans while the rest of the app is
     brush-face Long Cang), no press feedback, and a `border:` line with no width
     or style keyword that rendered nothing at all. */
  .action {
    background-color: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.75);
    border-radius: 6px;
    padding: clamp(6px, 1.5vh, 8px) clamp(10px, 2vw, 16px);
    margin: clamp(2px, 0.5vh, 6px);
    pointer-events: auto;
    color: #1a1a1a;
    font-family: var(--font-chinese);
    font-size: clamp(14pt, 3.5vw, 18pt);
    cursor: pointer;
    transition: background-color 0.15s, transform 0.05s, box-shadow 0.15s;

    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }

  .action:hover { background-color: #ffffff; }
  .action:active { transform: translateY(1px); }
  .action:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }

  /* 胡 -- the win -- is the one action worth singling out of an otherwise even
     column. It wears the same confirm-green as 再来一局 and the primary dialog
     button, so "this is the winning move" reads in the same colour the whole app
     uses for "yes, this one", and a soft glow lifts it off the white siblings. */
  .action.win {
    background-color: var(--green);
    border-color: var(--green);
    color: var(--green-ink);
    font-weight: bold;
    box-shadow: 0 0 10px rgba(173, 220, 145, 0.7);
  }

  .action.win:hover { background-color: var(--green-hover); }
  .action.win:active { background-color: var(--green-active); }
</style>
