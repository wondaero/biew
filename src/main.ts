import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { router } from './router'
import { initPwa } from './pwa'

createApp(App).use(router).mount('#app')
initPwa()
