<script>
  import context from '../../game/context';
  import Schema, { eq } from '../../lib/schema';

  const { store, socket } = context();

  $: winner = $store[$store.turn];
  $: allTiles = [...winner.up, ...winner.down.flat()]
    .filter(tile => typeof tile === 'number')
    .map(tile => $store.tiles[tile]);

  $: isDealer = $store.turn === 'Ton';
  $: isSelfDraw = $store.source === 'front' || $store.source === 'back';

  $: isPongpong = (() => {
    const downValid = winner.down.every(meld => {
      const meldTiles = meld.filter(t => typeof t === 'number').map(t => $store.tiles[t]);
      return meldTiles.length >= 3 && meldTiles.every(t => eq(t, meldTiles[0]));
    });
    if (!downValid) return false;
    const handTiles = winner.up.map(t => $store.tiles[t]);
    const nonWild = handTiles.filter(t => !($store.wildcard && eq(t, $store.wildcard)));
    const wilds = handTiles.length - nonWild.length;
    let remaining = [...nonWild];
    let usedWilds = 0;
    // remove one pair
    for (let i = 0; i < remaining.length; i++) {
      const match = remaining.slice(i + 1).findIndex(t => eq(t, remaining[i]));
      if (match !== -1) {
        const rest = [...remaining];
        rest.splice(i + 1 + match, 1);
        rest.splice(i, 1);
        // check all triplets in rest
        let check = [...rest];
        let ok = true;
        let w = wilds;
        while (check.length > 0) {
          const first = check[0];
          const matches = check.filter(t => eq(t, first)).length;
          if (matches >= 3) {
            check = check.filter((t, idx) => { let c = 0; return !(eq(t, first) && ++c <= 3); });
            // remove 3 of first
            let removed = 0;
            check = [...check]; // reset
            check = rest.filter(() => true); // redo
            // simpler approach
            break;
          }
          ok = false;
          break;
        }
        // simplified: just check if rest length is divisible by 3 and all triplets
        if (rest.length % 3 === 0) {
          let triplets = [...rest];
          let valid = true;
          let ww = wilds;
          while (triplets.length > 0) {
            const f = triplets[0];
            const cnt = triplets.filter(t => eq(t, f)).length;
            if (cnt >= 3) {
              let r = 0;
              triplets = triplets.filter(t => !(eq(t, f) && ++r <= 3));
            } else if (cnt + ww >= 3) {
              ww -= (3 - cnt);
              triplets = triplets.filter(t => !eq(t, f));
            } else {
              valid = false;
              break;
            }
          }
          if (valid) return true;
        }
      }
    }
    // try with wildcard as pair partner
    if (wilds >= 1 && nonWild.length % 3 === 0) {
      let triplets = [...nonWild];
      let valid = true;
      let ww = wilds - 1;
      while (triplets.length > 0) {
        const f = triplets[0];
        const cnt = triplets.filter(t => eq(t, f)).length;
        if (cnt >= 3) {
          let r = 0;
          triplets = triplets.filter(t => !(eq(t, f) && ++r <= 3));
        } else if (cnt + ww >= 3) {
          ww -= (3 - cnt);
          triplets = triplets.filter(t => !eq(t, f));
        } else {
          valid = false;
          break;
        }
      }
      if (valid) return true;
    }
    return false;
  })();

  $: isAllClear = winner.down.length === 0 && isSelfDraw;
  $: isAllFromOthers = !isSelfDraw && winner.down.length >= 3;

  $: isAllPairs = winner.up.length === 14 && (() => {
    const tiles = winner.up.map(t => $store.tiles[t]);
    const wild = $store.wildcard;
    const isW = (t) => wild && eq(t, wild);
    let wilds = tiles.filter(isW).length;
    const normals = tiles.filter(t => !isW(t));
    const remaining = [...normals];
    while (remaining.length) {
      const tile = remaining.pop();
      const idx = remaining.findIndex(other => eq(tile, other));
      if (idx === -1) {
        if (wilds > 0) { wilds--; } else { return false; }
      } else {
        remaining.splice(idx, 1);
      }
    }
    return wilds % 2 === 0;
  })();

  $: isAllJiang = allTiles.every(t => typeof t.value === 'number' && [2, 5, 8].includes(t.value));
  $: isAllWinds = allTiles.every(t => t.suit === 'wind');
  $: isAllSameKind = (() => {
    const suit = allTiles[0] && allTiles[0].suit;
    return allTiles.every(t => t.suit === suit);
  })();

  $: hasNoWildcard = !$store.wildcard || !allTiles.some(t => eq(t, $store.wildcard));

  $: kongCount = winner.down.filter(meld => meld.length >= 5).length;

  $: scoreBreakdown = (() => {
    const lines = [];
    let score = 1;
    lines.push({ label: '胡', value: '1' });

    if (isDealer) {
      score *= 2;
      lines.push({ label: '庄家', value: 'x2' });
    }
    if (isSelfDraw) {
      score *= 2;
      lines.push({ label: '自摸', value: 'x2' });
    }

    if (isPongpong) {
      score += 5;
      lines.push({ label: '碰碰胡', value: '+5' });
    }
    if (isAllClear) {
      score += 5;
      lines.push({ label: '门清', value: '+5' });
    }
    if (isAllFromOthers) {
      score += 5;
      lines.push({ label: '全求人', value: '+5' });
    }

    if (isAllPairs) {
      score += 10;
      lines.push({ label: '七对', value: '+10' });
    }
    if (isAllJiang) {
      score += 10;
      lines.push({ label: '全将', value: '+10' });
    }
    if (isAllWinds) {
      score += 10;
      lines.push({ label: '全风', value: '+10' });
    }
    if (isAllSameKind) {
      score += 10;
      lines.push({ label: '清一色', value: '+10' });
    }

    if (hasNoWildcard) {
      score *= 2;
      lines.push({ label: '无癞子', value: 'x2' });
    }
    for (let i = 0; i < kongCount; i++) {
      score *= 2;
      lines.push({ label: '杠', value: 'x2' });
    }

    return { lines, score };
  })();

  async function playAgain() {
    const { schema } = await socket.send('playAgain');
    $store = new Schema(schema);
  }
</script>

<div class="container">
  <h1 class="title">{$store[$store.turn].name} 胡了</h1>

  <div class="scores">
    {#each scoreBreakdown.lines as { label, value }}
      <div class="rule">{label}: {value}</div>
    {/each}
    <div class="total">合计: {scoreBreakdown.score} 分</div>
  </div>

  <button
    class="play-again"
    on:click={playAgain}>
    再来一局
  </button>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: absolute;
    left: 50vw;
    top: 15vh;
    width: 800px;
    height: 70vh;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.85);
    color: white;
  }

  .title {
    font-family: var(--font-chinese);
    text-align: center;
    margin: 0;
    padding: 10px;
    width: 80%;
    font-size: 24pt;
    border-bottom: 1px solid rgba(255, 255, 255, 0.25);
  }

  .scores {
    margin: 20px;
    font-size: 20pt;
    font-family: var(--font-chinese);
  }

  .rule {
    margin: 8px 0;
  }

  .total {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.5);
    font-weight: bold;
    font-size: 24pt;
  }

  .play-again {
    margin-top: auto;
    font-family: var(--font-chinese);
    font-size: 16pt;
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.75);
    padding: 12px;
    cursor: pointer;
    width: 100%;
  }
</style>
