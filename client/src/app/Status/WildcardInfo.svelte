<script>
  import images from '../images.js';
  import context from '../../game/context.js';

  const { store } = context();

  function tileStyle(tile) {
    if (typeof tile.value === 'number') {
      return `background-image: url(${images[tile.suit+tile.value]})`;
    }
    return `background-image: url(${images[tile.value]})`;
  }

  let wildcardStyle;
  $: {
    if ($store.wildcard) {
      wildcardStyle = tileStyle($store.wildcard);
    }
  }
</script>

{#if $store.wildcard}
  <div class="wildcard-info">
    <div class="label">癞子</div>
    <div class="tile wild" style={wildcardStyle} />
  </div>
{/if}

<style>
  .wildcard-info {
    /* Sits below CurrentWind, which docks to the same top-right corner
       (top: 0; padding: clamp(12px, 3vw, 32px); font-size: clamp(16pt, 4vw, 24pt)).
       Offset clears that box's worst-case height so the two never overlap. */
    position: fixed;
    top: clamp(64px, 16vh, 130px);
    right: clamp(8px, 3vw, 10vw);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .label {
    font-size: clamp(12px, 3vw, 18px);
    color: white;
    font-weight: bold;
    font-family: var(--font-chinese);
  }

  .tile {
    width: clamp(28px, 5vw, 5vh);
    height: clamp(36px, 6.5vw, 6.5vh);
    border-radius: 0.3vh;
    background-position: center;
    background-size: contain;
    background-repeat: no-repeat;
    background-color: white;
  }

  .tile.wild {
    box-shadow: 0 0 8px 2px gold;
  }
</style>
