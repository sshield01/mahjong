<div class="container">
  <h1 class="title">朋友一起打麻将</h1>
  <h2 class="subtitle">Mahjong with Friends</h2>
  <slot />
</div>

<style>
  .container {
    margin: clamp(20px, 8vh, 100px) clamp(16px, 5vw, 100px);
  }

  .title, .subtitle {
    font-family: var(--font-chinese);
    text-align: center;
    margin: 0;
  }

  .title {
    font-size: clamp(24pt, 6vw, 48pt);
  }

  .subtitle {
    font-size: clamp(14pt, 3vw, 24pt);
  }
</style>
