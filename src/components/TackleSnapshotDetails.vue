<script setup lang="ts">
import type { TackleSnapshot } from '../db/database'
defineProps<{ snapshot: TackleSnapshot }>()
</script>
<template>
  <details>
    <summary>{{ snapshot.setName }}（保存時の構成）</summary>
    <p>ロッド：{{ snapshot.rod.manufacturer }} / {{ snapshot.rod.modelName }} / {{ snapshot.rod.modelCode }} {{ snapshot.rod.length }} {{ snapshot.rod.power }}</p>
    <p>リール：{{ snapshot.reel.manufacturer }} / {{ snapshot.reel.modelName }} {{ snapshot.reel.size }} {{ snapshot.reel.year }} {{ snapshot.reel.gearRatio }}</p>
    <p>メインライン：<template v-if="snapshot.mainLine">{{ snapshot.mainLine.manufacturer }} {{ snapshot.mainLine.productName }} {{ snapshot.mainLine.material }} {{ snapshot.mainLine.strengthLb ? `${snapshot.mainLine.strengthLb}lb` : '' }} {{ snapshot.mainLine.sizeGo ? `${snapshot.mainLine.sizeGo}号` : '' }}</template><template v-else>未指定</template></p>
    <p>リーダー：<template v-if="snapshot.leader">{{ snapshot.leader.manufacturer }} {{ snapshot.leader.productName }} {{ snapshot.leader.material }} {{ snapshot.leader.strengthLb ? `${snapshot.leader.strengthLb}lb` : '' }} {{ snapshot.leader.sizeGo ? `${snapshot.leader.sizeGo}号` : '' }}</template><template v-else>なし</template></p>
  </details>
</template>
<style scoped>
details { font-size:13px; margin-top:8px; overflow-wrap:anywhere; }
p { margin:6px 0; }
summary { min-height:44px; cursor:pointer; }
</style>
