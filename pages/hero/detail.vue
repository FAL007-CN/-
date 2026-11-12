<template>
	<view class="page">
		<!-- 英雄详情 -->
		<view class="dl-card" v-if="hero">
			<image class="dl-card-img detail-img" :src="fullImg(hero.imgUrl)" mode="aspectFill" />
			<view class="dl-card-body">
				<text class="dl-card-title">{{ hero.title }}</text>
				<text class="dl-card-meta">英雄：{{ hero.name }}　{{ hero.introduction }}</text>
				<text class="dl-card-text detail-text">{{ hero.content }}</text>
				<text class="dl-card-meta">发布时间：{{ hero.createTime }}　点击量：{{ hero.clickNum }}</text>
			</view>
		</view>
		<view v-else-if="heroError" class="dl-empty">
			<text>{{ heroError }}</text>
		</view>

		<!-- 评论区 -->
		<view class="dl-section">
			<text>评论</text>
			<text class="dl-more">共 {{ cmtTotal }} 条</text>
		</view>

		<view class="dl-card cmt" v-for="c in comments" :key="c.evaluateId">
			<view class="cmt-body">
				<image class="cmt-avatar" :src="fullImg(c.fromUserAvatar)" mode="aspectFill" />
				<view class="cmt-main">
					<text class="cmt-name">{{ c.fromUserName }}</text>
					<text class="cmt-content">{{ c.evaluateContent }}</text>
					<text class="dl-card-meta">{{ c.createTime }}　点赞 {{ c.likeCount }}</text>
				</view>
			</view>
		</view>

		<view v-if="!comments.length" class="dl-empty">
			<text>{{ cmtLoading ? '正在加载评论…' : '暂无评论' }}</text>
		</view>

		<view v-if="comments.length" class="dl-loadmore" :class="{ disabled: cmtLoaded >= cmtTotal }" @tap="loadMoreComments">
			<text>{{ cmtLoaded >= cmtTotal ? '没有更多了' : '加载更多评论' }}</text>
		</view>

		<view class="dl-safe-bottom"></view>
	</view>
</template>

<script setup>
/**
 * ============================================================================
 * 英雄故事详情 pages/hero/detail.vue
 * ----------------------------------------------------------------------------
 * 对应 html/hero-detail.html。两件事：
 *   1. GET /api/hero/{id}                 拉详情
 *   2. GET /api/hero/evaluate/list?heroId 拉评论（分页）
 *
 * 【uni-app 里怎么拿网址参数？】
 *   页面用 onLoad(options) 拿到，options.id 就是上个页面传过来的 id。
 *   比原项目用 location.search 正则抠数字省事多了。
 * ============================================================================
 */
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { heroDetail, heroComments } from '@/api/index.js';
import { fullImg } from '@/utils/request.js';

const heroId = ref(0);
const hero = ref(null);
const heroError = ref('');

const comments = ref([]);
const cmtPage = ref(1);
const CMT_SIZE = 10;
const cmtTotal = ref(0);
const cmtLoaded = ref(0);
const cmtLoading = ref(false);

async function loadHero() {
	try {
		const res = await heroDetail(heroId.value);
		hero.value = res.data || null;
	} catch (e) {
		heroError.value = e.message || '没有找到这个英雄';
	}
}

async function loadComments() {
	if (cmtLoading.value) return;
	cmtLoading.value = true;
	try {
		const res = await heroComments(heroId.value, cmtPage.value, CMT_SIZE);
		cmtTotal.value = res.total || 0;
		const rows = res.rows || [];
		comments.value = comments.value.concat(rows);
		cmtLoaded.value += rows.length;
	} catch (e) {
		uni.showToast({ title: e.message, icon: 'none' });
	} finally {
		cmtLoading.value = false;
	}
}

function loadMoreComments() {
	if (cmtLoaded.value >= cmtTotal.value) return;
	cmtPage.value += 1;
	loadComments();
}

onLoad((options) => {
	heroId.value = Number(options && options.id) || 1;
	loadHero();
	loadComments();
});
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #f4f5f7;
	padding-bottom: 20rpx;
}

.detail-img {
	height: 400rpx;
}

.detail-text {
	/* 详情页不限行数，全文展示 */
	display: block;
	-webkit-line-clamp: unset;
	overflow: visible;
	white-space: pre-wrap;
}

.cmt {
	margin: 0 20rpx 16rpx;
}

.cmt-body {
	display: flex;
	padding: 24rpx;
}

.cmt-avatar {
	width: 76rpx;
	height: 76rpx;
	border-radius: 50%;
	flex-shrink: 0;
	background: #eeeeee;
}

.cmt-main {
	margin-left: 20rpx;
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
}

.cmt-name {
	font-size: 28rpx;
	font-weight: 600;
	color: #222222;
}

.cmt-content {
	margin-top: 8rpx;
	font-size: 26rpx;
	line-height: 1.6;
	color: #555555;
}
</style>
