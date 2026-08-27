<script>
  import context from '../../game/context';
  import Schema from '../../lib/schema';

  const { store, socket, myName } = context();

  $: winner = $store[$store.turn];

  // 黄庄: the wall ran down with nobody out, so there is no hand to lay out --
  // the dealer just collects a flat two from each of the others.
  $: washedOut = !!$store.washedOut;
  $: washOutLosers = ['Ton', 'Nan', 'Shaa', 'Pei']
    .filter(wind => $store[wind] && !$store[wind].waiting && wind !== $store.turn)
    .map(wind => $store[wind].name);

  // What the hand actually scored, itemised by the code that scored it and sent
  // with the win. This panel used to work it all out again from the finished
  // hand -- every flag, every multiplier, the dealer, the payments -- and the
  // second derivation drifted from the first four separate times: 无癞子 went
  // missing on claimed wins, 杠上开花 had to be added in two places, the dealer's
  // double was looked up by the wrong seat, and a chair reserved mid-hand was
  // billed for a hand it never played. Each one printed a breakdown that
  // contradicted the running totals just below it, and each was found by a
  // player reading the screen rather than by a test, because nothing here is
  // reachable from one.
  //
  // A hand from before this was sent, or a client that missed the message, has
  // nothing to itemise -- show the totals alone rather than a wrong guess.
  $: scoreBreakdown = $store.breakdown || { lines: [], losers: [], winnerTotal: 0 };

  async function playAgain() {
    const { schema } = await socket.send('playAgain');
    $store = new Schema(schema);
  }

  $: mySeat = $store.seatOf($myName);
</script>

<div class="container">
  <h1 class="title">{washedOut ? '黄庄' : `${$store[$store.turn].name} 胡了`}</h1>

  <div class="scores">
    {#if washedOut}
      <div class="rule">牌墙摸完，无人和牌</div>
      <div class="round-results">
        <div class="result-row">
          <span>{winner.name} (庄家)</span>
          <span class="positive">+{washOutLosers.length * 2}</span>
        </div>
        {#each washOutLosers as name}
          <div class="result-row">
            <span>{name}</span>
            <span class="negative">-2</span>
          </div>
        {/each}
      </div>
    {:else}
      {#each scoreBreakdown.lines as { label, value }}
        <div class="rule">{label}: {value}</div>
      {/each}
      <div class="round-results">
        <div class="result-row">
          <span>{winner.name}</span>
          <span class="positive">+{scoreBreakdown.winnerTotal}</span>
        </div>
        {#each scoreBreakdown.losers as loser}
          <div class="result-row">
            <span>{loser.name}{loser.reasons.length ? ' (' + loser.reasons.join(', ') + ')' : ''}</span>
            <span class="negative">-{loser.payment}{loser.rawScore > 30 ? ` (${loser.rawScore})` : ''}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if $store.scores && Object.keys($store.scores).length > 0}
    <div class="cumulative">
      <div class="cumulative-title">累计积分</div>
      {#each Object.entries($store.scores).sort((a, b) => b[1] - a[1]) as [name, score]}
        <div class="cumulative-row">
          <span class="player-name">{name}</span>
          <span class="player-score" class:positive={score > 0} class:negative={score < 0}>{score > 0 ? '+' : ''}{score}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if mySeat}
    <button
      class="play-again"
      on:click={playAgain}>
      再来一局
    </button>
  {/if}
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: fixed;
    left: 50%;
    top: 50%;
	transform: translate(-50%, -50%);
    width: min(90vw, 800px);
    max-height: 80vh;  
    background: rgba(0, 0, 0, 0.65);
    color: white;
    border-radius: 8px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .title {
    font-family: var(--font-chinese);
    text-align: center;
    margin: 0;
    padding: 10px;
    width: 80%;
    font-size: clamp(18pt, 5vw, 24pt);
    border-bottom: 1px solid rgba(255, 255, 255, 0.25);
  }

  .scores {
    margin: clamp(10px, 2vh, 20px);
    font-size: clamp(14pt, 4vw, 20pt);
    font-family: var(--font-chinese);
  }

  .rule {
    margin: 6px 0;
  }

  .round-results {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.3);
    font-size: clamp(12pt, 3.5vw, 18pt);
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    margin: 6px 0;
    min-width: min(250px, 60vw);
    gap: 16px;
  }

  .positive {
    color: #4caf50;
  }

  .negative {
    color: #f44336;
  }

  .cumulative {
    margin: clamp(10px, 2vh, 20px);
    /* Room for the sticky button: on a short screen it pins to the bottom, and
       without this the last score rows can never be scrolled out from under it. */
    margin-bottom: clamp(16px, 3vh, 28px);
    padding-top: clamp(12px, 2vh, 20px);
    border-top: 1px solid rgba(255, 255, 255, 0.3);
    font-family: var(--font-chinese);
    font-size: clamp(16pt, 5vw, 24pt);
  }

  .cumulative-title {
    font-weight: bold;
    margin-bottom: clamp(8px, 1.5vh, 14px);
    font-size: clamp(19pt, 5.5vw, 28pt);
    letter-spacing: 2px;
  }

  .cumulative-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: clamp(4px, 1vh, 10px) 0;
    min-width: min(300px, 70vw);
    gap: clamp(12px, 4vw, 32px);
  }

  /* Long Cang is a brush face -- beautiful for the headings, but it mangles
     digits. The totals switch to the sans face with tabular figures, so every
     score takes the same width and the column stays aligned whatever the sign. */
  .cumulative .player-name {
    font-family: var(--font-english);
    font-weight: 600;
  }

  .cumulative .player-score {
    font-family: var(--font-english);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: 1.15em;
  }

  .player-score.positive {
    color: #4caf50;
  }

  .player-score.negative {
    color: #f44336;
  }

  .play-again {
    margin-top: auto;
    /* Sticks to the bottom of the scrolling panel, so on a short screen the
       main action stays reachable instead of hiding below the scoreboard. */
    position: sticky;
    bottom: 0;
    z-index: 1;

    font-family: var(--font-chinese);
    font-size: clamp(16pt, 4.5vw, 20pt);
    font-weight: bold;
    letter-spacing: 3px;

    /* Was translucent white, which the bright tiles showing through the panel
       washed out until the primary action was hard to see at all. Solid, with
       dark text, so it reads against whatever is behind the table. */
    background: rgba(173, 220, 145, 0.96);
    color: #14301c;
    border: none;
    padding: clamp(12px, 2.4vh, 18px);
    cursor: pointer;
    width: 100%;
    border-radius: 0 0 8px 8px;
    transition: background 0.15s;
  }

  .play-again:hover {
    background: rgb(198, 235, 175);
  }

  .play-again:active {
    background: rgb(146, 196, 116);
  }
</style>
