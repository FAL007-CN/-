<template>
	<view class="page">
		<!-- 图1：条形图 · 2022 年每月评论数（按性别） -->
		<view class="dl-chart-card">
			<text class="dl-chart-title">2022年新闻评论数量（按性别）</text>
			<text class="dl-chart-tip">{{ barTip }}</text>
			<dl-chart type="bar" :labels="months" :series="barSeries" :height="220" />
			<view class="legend-row">
				<view class="legend-item"><view class="dot female"></view><text>女性评论数</text></view>
				<view class="legend-item"><view class="dot male"></view><text>男性评论数</text></view>
			</view>
		</view>

		<!-- 图2：折线图 · 2022 年每月阅读数量 -->
		<view class="dl-chart-card">
			<text class="dl-chart-title">2022年用户阅读数量趋势</text>
			<text class="dl-chart-tip">{{ lineTip }}</text>
			<dl-chart type="line" :labels="months" :data="lineData" :height="220" />
		</view>

		<!-- 图3：饼状图 · 书籍类型占比 -->
		<view class="dl-chart-card">
			<text class="dl-chart-title">用户阅读书籍类型占比</text>
			<text class="dl-chart-tip">{{ pieTip }}</text>
			<dl-chart type="pie" :items="pieItems" :height="250" />
		</view>

		<view class="dl-safe-bottom"></view>
	</view>
</template>

<script setup>
/**
 * ============================================================================
 * 数据分析 pages/analysis/analysis.vue（tab 页）
 * ----------------------------------------------------------------------------
 * 对应 html/analysis.html + js/charts.js。三张图，数据都要自己「拉全 → 统计 → 画」。
 *
 *   图1 条形图：2022 年 1~12 月评论数，分女性/男性
 *       GET /api/data/comment/list   → commentTime、commentUserSex（0男 1女）
 *   图2 折线图：2022 年 1~12 月阅读数量
 *       GET /api/read/book/list      → readTime
 *   图3 饼状图：书籍类型占比
 *       GET /api/read/book/list/type → bookTypeName
 *
 * 【为什么一定要「全部拉完」再统计？】
 * 接口是分页的，一页最多几千条，而 2022 年的评论有九千多条。
 * 只拉第一页算出来的数一定不对。fetchAll 会一页页循环到拿完为止。
 * ============================================================================
 */
import { ref, computed, onMounted } from 'vue';
import { commentList, readBookList, readBookTypeList, fetchAll } from '@/api/index.js';

const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

const female = ref([]);
const male = ref([]);
const barTip = ref('加载中…');

const lineData = ref([]);
const lineTip = ref('加载中…');

const pieItems = ref([]);
const pieTip = ref('加载中…');

const barSeries = computed(() => [
	{ name: '女性评论数', color: '#ec407a', data: female.value },
	{ name: '男性评论数', color: '#1e88e5', data: male.value }
]);

/** 判断时间是不是 2022 年，是就返回月份 1~12，不是返回 0 */
function monthOf2022(dateStr) {
	const s = String(dateStr || '');
	if (s.substring(0, 4) !== '2022') return 0;
	const m = Number(s.substring(5, 7));
	return m >= 1 && m <= 12 ? m : 0;
}

/* ------------------------------------------------ 图1：评论按月分性别 */
async function loadComments() {
	try {
		const rows = await fetchAll(commentList, 5000);
		const f = new Array(12).fill(0);
		const m = new Array(12).fill(0);
		rows.forEach((r) => {
			const mon = monthOf2022(r.commentTime);
			if (!mon) return;
			if (String(r.commentUserSex) === '1') f[mon - 1] += 1;
			else if (String(r.commentUserSex) === '0') m[mon - 1] += 1;
		});
		female.value = f;
		male.value = m;
		const totalYear = f.reduce((a, b) => a + b, 0) + m.reduce((a, b) => a + b, 0);
		barTip.value = `2022年共 ${totalYear} 条评论（女性/男性分月统计，原始数据 ${rows.length} 条）`;
	} catch (e) {
		barTip.value = '评论数据加载失败：' + e.message;
	}
}

/* -------------------------------------------- 图2：阅读数量按月趋势 */
async function loadReading() {
	try {
		const rows = await fetchAll(readBookList, 5000);
		const count = new Array(12).fill(0);
		rows.forEach((r) => {
			const mon = monthOf2022(r.readTime);
			if (mon) count[mon - 1] += 1;
		});
		lineData.value = count;
		const totalYear = count.reduce((a, b) => a + b, 0);
		lineTip.value = `2022年共阅读 ${totalYear} 本（按月统计）`;
	} catch (e) {
		lineTip.value = '阅读数据加载失败：' + e.message;
	}
}

/* ------------------------------------------------ 图3：书籍类型占比 */
async function loadTypes() {
	try {
		const rows = await fetchAll(readBookTypeList, 5000);
		const map = {};
		rows.forEach((r) => {
			const name = r.bookTypeName || '其他';
			map[name] = (map[name] || 0) + 1;
		});
		const list = Object.keys(map)
			.map((k) => ({ name: k, value: map[k] }))
			.sort((a, b) => b.value - a.value);
		pieItems.value = list;
		pieTip.value = `共 ${list.length} 种书籍类型，合计 ${rows.length} 条阅读记录`;
	} catch (e) {
		pieTip.value = '类型数据加载失败：' + e.message;
	}
}

onMounted(() => {
	loadComments();
	loadReading();
	loadTypes();
});
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #f4f5f7;
	padding-top: 10rpx;
	padding-bottom: 20rpx;
}

.legend-row {
	display: flex;
	justify-content: center;
	margin-top: 16rpx;
}

.legend-item {
	display: flex;
	align-items: center;
	margin: 0 20rpx;
	font-size: 22rpx;
	color: #777777;
}

.dot {
	width: 16rpx;
	height: 16rpx;
	border-radius: 50%;
	margin-right: 8rpx;
}

.dot.female {
	background: #ec407a;
}

.dot.male {
	background: #1e88e5;
}
</style>
