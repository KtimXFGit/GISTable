import { createApp } from 'vue'
import App from './App.vue'
import { router } from './app/router'
import 'ol/ol.css'
import './styles/main.css'
import './styles/enterprise.css'

createApp(App).use(router).mount('#app')
