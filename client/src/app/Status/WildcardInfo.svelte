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

  let indicatorStyle, wildcardStyle;
  $: {
    if ($store.indicator !== undefined) {
      indicatorStyle = tileStyle($store.tiles[$store.indicator]);
      wildcardStyle = tileStyle($store.wildcard);
    }
  }
</script>

{#if $store.indicator !== undefined}
  <div class="wildcard-info">
    <div class="label">Indicator</div>
    <div class="tile" style={indicatorStyle} />
    <div class="label">Wild</div>
    <div class="tile wild" style={wildcardStyle} />
  </div>
{/if}

<style>
  .wildcard-info {
    position: absolute;
    top: 15vh;
    right: 15vw;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .label {
    font-size: 14px;
    color: white;
    text-transform: uppercase;
    font-weight: bold;
  }

  .tile {
    width: min(3vw, 3vh);
    height: min(4vw, 4vh);
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
