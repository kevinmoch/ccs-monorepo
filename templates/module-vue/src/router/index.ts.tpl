import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import HomePage from '../pages/home/HomePage.vue';

function isIframe(): boolean {
	try {
		return window.top !== window.self;
	} catch {
		return false;
	}
}

const BASE = import.meta.env.BASE_URL;
const iframeMode = isIframe();

const router = createRouter({
	history: iframeMode ? createWebHashHistory(BASE) : createWebHistory(BASE),
	routes: [
		{ path: '/', name: 'Home', component: HomePage },
		// ccs-cli:route
	]
});
export default router;
