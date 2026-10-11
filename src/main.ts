import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { setupOffline } from './pwa'

createApp(App).mount('#app')
setupOffline()
