<template>
	<view class="page">
		<view class="dl-card" v-for="a in list" :key="a.id">
			<image class="dl-card-img act-img" :src="fullImg(a.imgUrl)" mode="aspectFill" />
			<view class="dl-card-body">
				<text class="dl-card-title">{{ a.activityName }}</text>
				<text class="dl-card-meta">报名人数：{{ a.applyNum }} 人</text>
				<text class="dl-card-meta">活动时间：{{ a.startEndTime }}</text>
				<text class="dl-card-text dl-clamp-2">{{ a.activityDetail }}</text>
				<view class="act-foot">
					<text class="dl-card-meta">发起方：{{ a.initiator || '公益组织' }}</text>
					<view class="dl-btn-sm" @tap="openDetail(a.id)">
						<text>报名</text>
					</view>
				</view>
			</view>
		</view>

		<view v-if="!list.length" class="dl-empty">
			<text>{{ loading ? '正在加载…' : '暂无活动' }}</text>
		</view>

		<view v-if="list.length" class="dl-loadmore" :class="{ disabled: loaded >= total }" @tap="loadMore">
			<text>{{ loaded >= total ? '没有更多了' : '加载更多' }}</text>
		</view>

		<view class="dl-safe-bottom"></view>
	</view>
</template>

<script setup>
/**
 * ============================================================================
 * 公益活动列表 pages/activity/activity.vue（tab 页）
 * ----------------------------------------------------------------------------
 * 对应 html/activity.html。接口：GET /api/activity/list
 * 每张卡片显示：大图、名称、报名人数、时间、简介、发起方、报名按钮。
 * 点"报名"进入详情页，详情页才真正发报名请求（防止误点）。
 * ============================================================================
 */
import { ref, onMounted } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { activityList } from '@/api/index.js';
import { fullImg } from '@/utils/request.js';

const list = ref([]);
const pageNum = ref(1);
const PAGE_SIZE = 10;
const total = ref(0);
const loaded = ref(0);
const loading = ref(false);

async function load(reset = false) {
	if (loading.value) return;
	if (reset) {
		pageNum.value = 1;
		loaded.value = 0;
		list.value = [];
	}
	loading.value = true;
	try {
		const res = await activityList(pageNum.value, PAGE_SIZE);
		total.value = res.total || 0;
		const rows = res.rows || [];
		list.value = list.value.concat(rows);
		loaded.value += rows.length;
	} catch (e) {
		uni.showToast({ title: e.message, icon: 'none' });
	} finally {
		loading.value = false;
	}
}

function loadMore() {
	if (loaded.value >= total.value) return;
	pageNum.value += 1;
	load(false);
}

function openDetail(id) {
	uni.navigateTo({ url: `/pages/activity/detail?id=${id}` });
}

onMounted(() => load(true));

// 从详情页报名完退回来，人数要更新，所以每次显示都重新拉第一页
onShow(() => {
	if (list.value.length) load(true);
});

onPullDownRefresh(async () => {
	await load(true);
	uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #f4f5f7;
	padding-top: 10rpx;
}

.act-img {
	height: 300rpx;
}

.act-foot {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-top: 20rpx;
}
</style>
