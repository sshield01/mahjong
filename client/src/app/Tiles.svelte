<script>
  import { get } from 'svelte/store';
  import Tile from './Tile.svelte';
  import Schema, { eq } from '../lib/schema.js';
  import context from '../game/context.js';

  export let tableAngle;

  const { selection, selectionSets, socket, store, timer, hasAction } = context();

  let discarded;
  $: discarded = $store && $store.tiles[$store.discarded];

  let myWind;
  $: myWind = $store && $store.playerWind(socket.name);

  let myTurn;
  $: myTurn = $store && $store.turn === myWind;

  let myDiscard;
  $: myDiscard = $store && $store.previousTurn === myWind;

  let toDraw = -1;
  $: {
      const storeValue = $store;
      if (storeValue) {
        if (storeValue.roll !== undefined) {
          const [wall, stackIndex] = storeValue.nextDraw();
          const stack = storeValue.walls[wall][stackIndex];
          toDraw = stack[stack.length - 1];
        } else {
          toDraw = -1;
        }
     }
  }

  let exactMatches = [];
  $: {
    const storeValue = $store;
    if (discarded && !(storeValue.wildcard && eq(discarded, storeValue.wildcard))) {
      exactMatches = storeValue[myWind].up.filter(tile => storeValue.tiles[tile].suit === discarded.suit && storeValue.tiles[tile].value === discarded.value);
    } else {
      exactMatches = [];
    }
  };

  let canMatchSelection;
  $: canMatchSelection = selectionSet => [...$selection].every(tile => selectionSet.tiles.includes(tile));

  let canWin = false;
  $: {
    const storeValue = $store;
    if (discarded) {
      const player = { ...storeValue[myWind] };
      player.up = [...player.up, storeValue.discarded];
      canWin = Schema.winningHand(storeValue, player, storeValue.discarded);
    } else {
      canWin = false;
    }
  }

  let canChow = [];
  $: {
    const storeValue = $store;
    const isWild = (t) => storeValue.wildcard && eq(t, storeValue.wildcard);
    if (discarded && !isWild(discarded)) {
      if (typeof discarded.value === 'number') {
        const ofSuit = storeValue[myWind].up.filter(tile => storeValue.tiles[tile].suit === discarded.suit && !isWild(storeValue.tiles[tile]));
        const required = [
          ofSuit.find(tile => storeValue.tiles[tile].value === discarded.value - 2),
          ofSuit.find(tile => storeValue.tiles[tile].value === discarded.value - 1),
          ofSuit.find(tile => storeValue.tiles[tile].value === discarded.value + 1),
          ofSuit.find(tile => storeValue.tiles[tile].value === discarded.value + 2),
        ];
        canChow = [
          required.slice(0, 2).every(x => typeof x === 'number') ? [required[0], required[1]] : null,
          required.slice(1, 3).every(x => typeof x === 'number') ? [required[1], required[2]] : null,
          required.slice(2, 4).every(x => typeof x === 'number') ? [required[2], required[3]] : null,
        ].filter(x => x);
      }
    } else {
      canChow = [];
    }
  }

  let selecting = false;
  $: {
    const list = [];
    const storeValue = $store;
    if (myWind) {
      const pongs = [];
      if (exactMatches.length === 2) {
        pongs.push(exactMatches);
      } else if (exactMatches.length === 3) {
        pongs.push(...[
          [exactMatches[0], exactMatches[1]],
          [exactMatches[1], exactMatches[2]],
          [exactMatches[2], exactMatches[0]],
        ]);
        list.push({
          tiles: exactMatches,
          label: '杠',
          async handler() {
            try {
              await socket.send('kong', { mode: 'exposed' });
              selection.set(new Set);
              selecting = false;
            } catch (error) {
              console.error(error);
            }
          },
        });
      }

      for (const tiles of pongs) {
        list.push({
          tiles,
          label: '碰',
          async handler() {
            try {
              await socket.send('pong');
              selection.set(new Set);
              selecting = false;
            } catch (error) {
              console.error(error);
            }
          },
        });

        const player = { ...storeValue[myWind] };
        player.up = player.up.filter(tile => !tiles.includes(tile));
        player.down = [...player.down, [...tiles, storeValue.discarded]];
        if (Schema.winningHand(storeValue, player)) {
          list.push({
            tiles,
            label: '胡',
            async handler() {
              try {
                await socket.send('win', { method: 'Pong' });
                selection.set(new Set);
                selecting = false;
              } catch (error) {
                console.error(error);
              }
            },
          });
        }
      }

      if (myTurn) {
        list.push(...canChow.map(tiles => ({
          tiles,
          label: '吃',
          async handler() {
            try {
              await socket.send('chow', { tiles });
              selection.set(new Set);
              selecting = false;
            } catch (error) {
              console.error(error);
            }
          },
        })));
      }

      if (canWin) {
        const eyeTile = exactMatches[0] !== undefined ? exactMatches[0]
          : storeValue[myWind].up.find(tile => storeValue.wildcard && eq(storeValue.tiles[tile], storeValue.wildcard));
        list.push({
          tiles: eyeTile !== undefined ? [eyeTile] : [],
          label: '胡',
          async handler() {
            try {
              await socket.send('win', { method: 'Eyes' });
              selection.set(new Set);
              selecting = false;
            } catch (error) {
              console.error(error);
            }
          },
        });
      }

      const willWin = tiles => {
        const player = { ...storeValue[myWind] };
        player.up = player.up.filter(tile => !tiles.includes(tile));
        player.down = [...player.down, [...tiles, storeValue.discarded]];
        return Schema.winningHand(storeValue, player);
      }
      list.push(...canChow.filter(willWin).map(tiles => ({
        tiles,
        label: '胡',
        async handler() {
          try {
            await socket.send('win', { method: 'Chow', tiles });
            selection.set(new Set);
            selecting = false;
          } catch (error) {
            console.error(error);
          }
        },
      })));
    }
    selectionSets.set(list);
  }

  let handlers;
  $: {
    const storeValue = $store;
    if (storeValue) {
      if (storeValue.completed) {
        handlers = [];
      } else {
        handlers = storeValue.tiles.map((tile, index) => {
          if (myTurn) {
            if (typeof storeValue.drawn === 'number') {
              if (storeValue[storeValue.turn].up.includes(index) && !(storeValue.wildcard && eq(storeValue.tiles[index], storeValue.wildcard))) {
                return async () => {
                  try {
                    await socket.send('discard', { tile: index });
                  } catch (error) {
                    console.error(error);
                  }
                };
              }
            } else if (index === toDraw) {
              return async () => {
                try {
                  await socket.send('draw', {});
                } catch (error) {
                  console.error(error);
                }
              };
            }
          }

          if ([].concat(...$selectionSets.filter(canMatchSelection).map(set => set.tiles)).includes(index) && selecting) {
            return () => {
              const selected = get(selection);
              if (selected.has(index)) {
                selected.delete(index);
              } else {
                selected.add(index);
              }
              selection.set(selected);
            };
          }

          if (index === storeValue.discarded && !myDiscard) {
            const combos = [...new Set($selectionSets.map(set => JSON.stringify([...set.tiles].sort())))];
            if ($selectionSets.length === 1) {
              return async () => {
                await $selectionSets[0].handler();
              };
            } else if ($selectionSets.length > 1) {
              return async () => {
                try {
                  if (selecting) {
                    selection.set(new Set());
                    selecting = !selecting;
                    await socket.send(myTurn ? 'draw' : 'ignore');
                  } else {
                    // Clear the timeout so we don't get penalized for slow clicking, but let's leave the timer value so it
                    // doesn't get reset
                    const { handle } = get(timer) || {};
                    if (handle) {
                      window.clearTimeout(handle);
                    }
                    if (combos.length === 1) {
                      // Multiple labeled actions (e.g. Pong and Win) share the one
                      // unambiguous set of tiles -- no need to make the player
                      // re-click their own hand tiles just to choose between them;
                      // select those tiles automatically and let the action buttons
                      // (rendered once $selection matches) do the choosing.
                      selection.set(new Set(JSON.parse(combos[0])));
                    }
                    selecting = !selecting;
                  }
                } catch (error) {
                  console.error(error);
                }
              };
            }
          }
        });
      }
    }
  }

  $: $hasAction = !myTurn && $selectionSets.length;
</script>

{#if $store}
  {#each $store.tiles as tile, index}
    <Tile {tableAngle} {tile} {index} clickable={!!handlers[index]} on:click={handlers[index]} selected={$selection.has(index)} />
  {/each}
{/if}
