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
    position: fixed;
    top: 10vh;
    right: 10vw;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .label {
    font-size: 18px;
    color: white;
    font-weight: bold;
    font-family: var(--font-chinese);
  }

  .tile {
    width: min(5vw, 5vh);
    height: min(6.5vw, 6.5vh);
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
