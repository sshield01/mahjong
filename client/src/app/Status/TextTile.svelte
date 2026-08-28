<script>
  import images from '../images.js';
  import context from '../../game/context.js';

  const { store } = context();

  export let tile;

  let style;
  $: {
    const info = $store.tiles[tile];
    if (typeof info.value === 'number') {
      style = `background-image: url(${images[info.suit+info.value]})`;
    } else {
      style = `background-image: url(${images[info.value]})`;
    }
  };
</script>

<span class="tile" {style} />

<style>
  /* Sits inline in the 杠 button label, so it scales with that button's text
     rather than the fixed px it used to be -- the only tile in the app that had
     not moved to relative units, so it stayed put while its button grew on a
     larger screen. `em` ties it to the surrounding font size; the ~0.52 ratio
     keeps the tile's real 4:5.3 proportions (and its inset face). */
  .tile {
    display: inline-block;
    width: 1.2em;
    height: 2.3em;
    vertical-align: -0.7em;
    border-radius: 0.15em;
    background-position: center;
    background-size: 87% 91%;
    background-repeat: no-repeat;
    background-color: white;
  }
</style>
