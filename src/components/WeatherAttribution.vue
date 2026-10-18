<template>
  <aside class="weather-attribution" aria-label="気象データの出典と注意事項">
    <p>この気象データは気象モデル・格子点に基づく過去の推定値であり、釣り場現地で測定された値ではありません。</p>
    <p><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo.com</a> ·
      <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>
    <p>Historical Weather API（Best Match）。取得値を時間別に整形し、時刻を日本時間で表示しています。欠損は「—」です。</p>
  </aside>
</template>
<style scoped>
.weather-attribution { font-size:13px; color:var(--text-muted); overflow-wrap:anywhere; }
p { margin:8px 0; } a { color:var(--text); text-decoration:underline; }
</style>
