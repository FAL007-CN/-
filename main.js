/**
 * ============================================================================
 * 入口文件 main.js
 * ----------------------------------------------------------------------------
 * uni-app Vue3 的固定写法：导出一个 createApp 函数，框架自己调用。
 * 和普通 Vue3 项目（Vue.createApp(...).mount('#app')）不一样，
 * 因为 uni-app 要同时管 App / H5 / 小程序多端，创建时机得由框架控制。
 * ============================================================================
 */
import { createSSRApp } from 'vue';
import App from './App.vue';

export function createApp() {
	const app = createSSRApp(App);
	return { app };
}
