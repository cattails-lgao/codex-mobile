import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'

console.log('Welcome to codexapp. GitHub: https://github.com/friuns2/codexui')

createApp(App).use(router).mount('#app')

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed.', error)
    })
  })
}
