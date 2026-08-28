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

  // The dealer may have won or lost, so the badge goes on whichever row is
  // theirs. It replaces a 庄家 entry that used to sit in the loser's list of
  // causes -- dealing is a standing property of the seat, not something that
  // happened during the hand, and it belongs beside the name like the same badge
  // on the table rather than among 放炮 and 杠x2.
  $: isDealer = (name) => !!scoreBreakdown.dealer && name === scoreBreakdown.dealer;

  async function playAgain() {
    const { schema } = await socket.send('playAgain');
    $store = new Schema(schema);
  }

  $: mySeat = $store.seatOf($myName);

  // The panel covers the table it is describing. Everyone's hand is turned face
  // up at the end of a game and that is worth looking at -- how the winner got
  // there, what everybody else was holding -- so it folds down to a bar instead
  // of having to be dismissed. The bar keeps the result and 再来一局 on it, so
  // getting the table back never costs the player their way forward.
  let minimized = false;
  $: title = washedOut ? '黄庄' : `${$store[$store.turn].name} 胡了`;
</script>

{#if minimized}
  <div class="minimized">
    <span class="minimized-title">{title}</span>
    <button class="fold" on:click={() => (minimized = false)}>展开</button>
    {#if mySeat}
      <button class="play-again compact" on:click={playAgain}>再来一局</button>
    {/if}
  </div>
{:else}
<div class="container">
  <div class="header">
    <h1 class="title">{title}</h1>
    <button class="fold" on:click={() => (minimized = true)}>收起</button>
  </div>

  <div class="scores">
    {#if washedOut}
      <div class="rule">牌墙摸完，无人和牌</div>
      <div class="round-results">
        <div class="result-row">
          <span>{winner.name}{#if isDealer(winner.name)}<span class="dealer">庄</span>{/if}</span>
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
          <span>{winner.name}{#if isDealer(winner.name)}<span class="dealer">庄</span>{/if}</span>
          <span class="positive">+{scoreBreakdown.winnerTotal}</span>
        </div>
        {#each scoreBreakdown.losers as loser}
          <div class="result-row">
            <span>{loser.name}{#if isDealer(loser.name)}<span class="dealer">庄</span>{/if}{loser.reasons.length ? ' (' + loser.reasons.join(', ') + ')' : ''}</span>
            <span class="negative">-{loser.payment}{loser.rawScore > 30 ? ` (${loser.rawScore})` : ''}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if $store.scores && Object.keys($store.scores).length > 0}
    <div class="cumulative">
      <span class="cumulative-title">累计积分</span>
      {#each Object.entries($store.scores).sort((a, b) => b[1] - a[1]) as [name, score]}
        <span class="cumulative-entry">
          <span class="player-name">{name}</span>
          <span class="player-score" class:positive={score > 0} class:negative={score < 0}>{score > 0 ? '+' : ''}{score}</span>
        </span>
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
{/if}

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

  /* The title keeps its 80% width and centred text; the fold control sits in the
     margin beside it rather than in the flow, so adding it did not move the
     heading off centre. */
  .header {
    position: relative;
    width: 100%;
    display: flex;
    justify-content: center;
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

  .fold {
    position: absolute;
    right: clamp(6px, 1.5vw, 14px);
    top: 50%;
    transform: translateY(-50%);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.12);
    color: white;
    font-family: var(--font-chinese);
    font-size: clamp(10pt, 2.6vw, 13pt);
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
  }

  /* Folded away: a bar at the top of the screen, clear of the table and of the
     hands laid out across it. It carries 再来一局 as well as the way back, so
     looking at the tiles never costs the player their way forward. */
  .minimized {
    position: fixed;
    left: 50%;
    top: clamp(8px, 2vh, 20px);
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: clamp(8px, 2vw, 16px);
    padding: 6px clamp(10px, 2vw, 16px);
    border-radius: 24px;
    background: rgba(0, 0, 0, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: white;
    white-space: nowrap;
    z-index: 2;
  }

  .minimized-title {
    font-family: var(--font-chinese);
    font-size: clamp(12pt, 3.2vw, 16pt);
  }

  .minimized .fold {
    position: static;
    transform: none;
  }

  /* The same button, off its footer: it is full-width with square bottom corners
     down there because it is the panel's base, and neither of those suits a pill
     sitting in a bar. */
  .play-again.compact {
    position: static;
    margin: 0;
    width: auto;
    padding: 4px 14px;
    font-size: clamp(10pt, 2.6vw, 13pt);
    letter-spacing: 1px;
    border-radius: 16px;
  }

  .scores {
    margin: clamp(10px, 2vh, 20px);
    font-size: clamp(14pt, 4vw, 20pt);
    font-family: var(--font-chinese);
  }

  .rule {
    margin: 6px 0;
  }

  /* Same size as the 胡 lines above it, which it inherits from `.scores`: the
     bonuses and the payments they add up to are one account of one hand, and
     sizing them differently split it in two. It was briefly larger, to outweigh
     the running totals below -- but those were the thing out of proportion, and
     they have since been cut down to a single small line, so the result no
     longer has to shout over anything. */
  .round-results {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.3);
  }

  /* Same reasoning as the totals further down: Long Cang is a brush face and
     mangles digits, which matters more here now that these are the figures being
     read first. Tabular so the column holds its shape whatever the sign. */
  .result-row .positive, .result-row .negative {
    font-family: var(--font-english);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    margin: 6px 0;
    min-width: min(250px, 60vw);
    gap: 16px;
  }

  /* The same gold chip the table wears, so the dealer is recognisably the same
     seat here as during the hand. */
  .dealer {
    font-family: var(--font-chinese);
    font-size: 0.75em;
    font-weight: 600;
    margin-left: 6px;
    padding: 0 6px;
    border-radius: 8px;
    background: rgba(255, 215, 0, 0.28);
    color: #ffe9a8;
    white-space: nowrap;
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
    /* Standing context, not the news: small, and on a single line under the
       hand's own result rather than a stacked column competing with it. Wraps
       rather than overflowing, so a four-player table on a narrow screen folds
       onto a second line instead of pushing the panel wider. */
    font-size: clamp(9pt, 2.4vw, 12pt);
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: center;
    gap: clamp(6px, 1.6vw, 14px);
  }

  .cumulative-title {
    font-weight: bold;
    letter-spacing: 2px;
    /* Leads the line rather than heading a block, so it keeps its own size and
       gives up the margin it used to sit above. */
    margin: 0;
  }

  /* One player: the name and their total kept together, so a wrap can only ever
     break between players and never between somebody and their score. */
  .cumulative-entry {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    white-space: nowrap;
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
