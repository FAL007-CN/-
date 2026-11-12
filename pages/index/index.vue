<template>
	<view class="page">
		<!-- ================= 1. 轮播图 ================= -->
		<view class="banner">
			<swiper
				v-if="banners.length"
				class="banner-swiper"
				:autoplay="true"
				:interval="3000"
				:duration="400"
				:circular="true"
				:indicator-dots="banners.length > 1"
				indicator-color="rgba(255,255,255,.45)"
				indicator-active-color="#ffffff"
			>
				<swiper-item v-for="(b, i) in banners" :key="b.id || i">
					<image class="banner-img" :src="fullImg(b.imgUrl)" mode="aspectFill" />
					<view class="banner-title"><text>{{ b.title }}</text></view>
				</swiper-item>
			</swiper>
			<view v-else class="banner-holder">
				<text>{{ bannerFailed ? '轮播图加载失败' : '加载中…' }}</text>
			</view>
		</view>

		<!-- ================= 2. 宫格入口 ================= -->
		<view class="dl-grid">
			<view class="dl-grid-item" v-for="g in grids" :key="g.name" @tap="go(g.url)">
				<view class="dl-grid-icon" :class="g.color">
					<text class="icon-txt">{{ g.icon }}</text>
				</view>
				<text class="dl-grid-name">{{ g.name }}</text>
			</view>
		</view>

		<!-- ================= 3. 热点楷模新闻 ================= -->
		<view class="dl-section">
			<text>热点楷模新闻</text>
			<text class="dl-more" @tap="go('/pages/model/model')">全部 ›</text>
		</view>

		<view class="news-wrap">
			<view class="dl-news" v-for="n in news" :key="n.id" @tap="go('/pages/model/model')">
				<image class="dl-news-img" :src="fullImg(n.imgUrl)" mode="aspectFill" />
				<view class="dl-news-info">
					<text class="dl-news-title">{{ n.title }}</text>
					<text class="dl-news-name">楷模：{{ n.name }}</text>
					<text class="dl-news-desc">{{ n.content }}</text>
				</view>
			</view>

			<view v-if="!news.length" class="dl-empty">
				<text>{{ newsLoading ? '正在加载…' : '暂无新闻' }}</text>
			</view>

			<view
				v-if="news.length"
				class="dl-loadmore"
				:class="{ disabled: loaded >= total }"
				@tap="loadMore"
			>
				<text>{{ loaded >= total ? '没有更多了' : '查看更多' }}</text>
			</view>
		</view>

		<view class="dl-safe-bottom"></view>
	</view>
</template>

<script setup>
/**
 * ============================================================================
 * 首页 pages/index/index.vue
 * ----------------------------------------------------------------------------
 * 对应原项目 html/first.html，三块内容：
 *   1. 广告轮播图   GET /api/building/banner/list
 *   2. 六个宫格入口（跳转到各功能页）
 *   3. 楷模新闻列表 GET /api/model/list（默认 5 条，点"查看更多"再加 5 条）
 *
 * 【和原项目最大的区别】
 *   原项目是用字符串拼 HTML 再 innerHTML 塞进去；
 *   这里是数据驱动：数据一变，Vue 自动更新页面。不用再手动 insertAdjacentHTML 了。
 * ============================================================================
 */
import { ref, onMounted } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { bannerList, modelList } from '@/api/index.js';
import { fullImg, getToken } from '@/utils/request.js';

const banners = ref([]);
const bannerFailed = ref(false);

const news = ref([]);
const total = ref(0);
const loaded = ref(0);
const newsLoading = ref(false);
const pageNum = ref(1);
const PAGE_SIZE = 5; // 赛题要求：默认显示 5 条

// 六个宫格入口
const grids = [
	{ name: '楷模列表', icon: '★', color: 'dl-c1', url: '/pages/model/model' },
	{ name: '英雄故事', icon: '英', color: 'dl-c2', url: '/pages/hero/hero' },
	{ name: '身边英雄', icon: '近', color: 'dl-c3', url: '/pages/around/around' },
	{ name: '物资捐赠', icon: '捐', color: 'dl-c4', url: '/pages/donation/donation' },
	{ name: '数据分析', icon: '▤', color: 'dl-c5', url: '/pages/analysis/analysis' },
	{ name: '个人中心', icon: '我', color: 'dl-c6', url: '/pages/user/user' }
];

function go(url) {
	// switchTab 只能跳 tabBar 页，其他页用 navigateTo
	const tabs = ['/pages/index/index', '/pages/activity/activity', '/pages/study/study', '/pages/ai/ai', '/pages/analysis/analysis'];
	if (tabs.indexOf(url) >= 0) uni.switchTab({ url });
	else uni.navigateTo({ url });
}

/* ------------------------------------------------ 轮播图 */
async function loadBanner() {
	try {
		const res = await bannerList();
		banners.value = res.rows || [];
	} catch (e) {
		bannerFailed.value = true;
	}
}

/* ------------------------------------------------ 新闻 */
async function loadNews(reset = false) {
	if (newsLoading.value) return;
	if (reset) {
		pageNum.value = 1;
		loaded.value = 0;
		news.value = [];
	}
	newsLoading.value = true;
	try {
		const res = await modelList(pageNum.value, PAGE_SIZE);
		total.value = res.total || 0;
		const rows = res.rows || [];
		news.value = reset ? rows : news.value.concat(rows);
		loaded.value += rows.length;
	} catch (e) {
		uni.showToast({ title: e.message, icon: 'none' });
	} finally {
		newsLoading.value = false;
	}
}

function loadMore() {
	if (loaded.value >= total.value) return;
	pageNum.value += 1;
	loadNews(false);
}

onMounted(() => {
	if (!getToken()) {
		uni.reLaunch({ url: '/pages/login/login' });
		return;
	}
	loadBanner();
	loadNews(true);
});

// 下拉刷新：轮播图和新闻都重新拉
onPullDownRefresh(async () => {
	await Promise.all([loadBanner(), loadNews(true)]);
	uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #f4f5f7;
}

/* ---------------- 轮播 ---------------- */
.banner {
	position: relative;
	height: 340rpx;
	background: #dfe7f1;
}

.banner-swiper {
	height: 340rpx;
}

.banner-img {
	width: 100%;
	height: 340rpx;
	display: block;
}

.banner-title {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	padding: 12rpx 20rpx;
	background: rgba(0, 0, 0, 0.45);
	color: #ffffff;
	font-size: 26rpx;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 1;
	overflow: hidden;
}

.banner-holder {
	height: 340rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 26rpx;
	color: #8899aa;
}

/* ---------------- 宫格 ---------------- */
.icon-txt {
	font-size: 40rpx;
	color: #ffffff;
	font-weight: 600;
}

/* ---------------- 新闻 ---------------- */
.news-wrap {
	background: #ffffff;
	padding-bottom: 10rpx;
}
</style>
