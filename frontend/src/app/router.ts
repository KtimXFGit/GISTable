import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import AppWorkspace from '../pages/WorkspacePage.vue'

const history = import.meta.env.VITE_ROUTER_MODE === 'history'
  ? createWebHistory(import.meta.env.BASE_URL)
  : createWebHashHistory(import.meta.env.BASE_URL)

export const router = createRouter({
  history,
  routes: [
    { path: '/', redirect: '/map' },
    { path: '/map', component: AppWorkspace },
    { path: '/:pathMatch(.*)*', redirect: '/map' },
  ],
})
