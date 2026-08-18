<script>
  import images from '../images.js';

  export let tile;

  let style;
  $: {
    if (typeof tile.value === 'number') {
      style = `background-image: url(${images[tile.suit+tile.value]})`;
    } else {
      style = `background-image: url(${images[tile.value]})`;
    }
  };
</script>

<div class="tile" {style} />

<style>
  .tile {
    position: fixed;
    top: clamp(8px, 2vh, 32px);
    left: 50%;
    transform: translateX(-50%);
    width: clamp(28px, 4vh, 4vh);
    height: clamp(42px, 6vh, 6vh);
    border-radius: 0.5vh;
    padding: 5%;
    background-position: center;
    background-size: contain;
    background-repeat: no-repeat;
    background-color: white;
  }
</style>
