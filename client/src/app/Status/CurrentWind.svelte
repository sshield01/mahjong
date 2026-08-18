<script>
  export let wind;

  const CHARACTER = {
    Pei: '北',
    Nan: '南',
    Shaa: '西',
    Ton: '东',
  };
</script>

<div class="wind">
  {CHARACTER[wind]}
</div>

<style>
  .wind {
    position: fixed;
    top: 0;
    right: 0;
    padding: clamp(12px, 3vw, 32px);
    font-size: clamp(16pt, 4vw, 24pt);
    color: white;
    font-family: var(--font-chinese);
  }
</style>
