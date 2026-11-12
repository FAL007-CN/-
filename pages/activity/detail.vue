<template>
	<view class="page">
		<!-- 活动详情 -->
		<view class="dl-card" v-if="act">
			<image class="dl-card-img detail-img" :src="fullImg(act.imgUrl)" mode="aspectFill" />
			<view class="dl-card-body">
				<text class="dl-card-title">{{ act.activityName }}</text>
				<text class="dl-card-meta">活动时间：{{ act.startEndTime }}</text>
				<text class="dl-card-meta">发起方：{{ act.initiator || '公益组织' }}</text>
				<text class="dl-card-meta">已报名人数：{{ act.applyNum }} 人</text>
				<text class="dl-card-text detail-text">{{ act.activityDetail }}</text>
			</view>
		</view>
		<view v-else-if="errMsg" class="dl-empty">
			<text>{{ errMsg }}</text>
		</view>

		<!-- 报名区 -->
		<view class="dl-card apply-box">
			<text class="apply-status">{{ statusText }}</text>
			<view class="dl-btn" :class="{ disabled: applied }" @tap="onApply">
				<text>{{ applied ? '已报名' : submitting ? '提交中…' : '报 名' }}</text>
			</view>
		</view>

		<view class="dl-safe-bottom"></view>
	</view>
</template>

<script setup>
/**
 * ============================================================================
 * 公益活动详情 / 报名 pages/activity/detail.vue
 * ----------------------------------------------------------------------------
 * 对应 html/activity-detail.html。用到三个接口：
 *   1. GET  /api/activity/{id}          活动详情
 *   2. GET  /api/activity/apply/list    我的报名记录（用来判断"报过没"）
 *   3. POST /api/activity/apply         报名
 *
 * 【为什么还要查「已报名列表」？】
 * 接口文档里没有"查某个活动报没报过"的接口，只能把我的报名记录全拉下来，
 * 在里面找有没有当前这个 activityId。这是接口设计不完善时的常见做法。
 * ============================================================================
 */
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { activityDetail, myApplyList, applyActivity } from '@/api/index.js';
import { fullImg } from '@/utils/request.js';

const activityId = ref(0);
const act = ref(null);
const errMsg = ref('');
const myApply = ref(null);
const submitting = ref(false);

const applied = computed(() => !!myApply.value);
const statusText = computed(() => {
	if (myApply.value) return `报名时间：${myApply.value.createTime}　状态：已报名`;
	return '还没有报名，点下面按钮报名吧';
});

async function loadDetail() {
	try {
		const res = await activityDetail(activityId.value);
		act.value = res.data || null;
	} catch (e) {
		errMsg.value = e.message || '没有找到这个活动';
	}
}

async function loadApplyStatus() {
	try {
		const res = await myApplyList(1, 100);
		const rows = res.rows || [];
		myApply.value = rows.find((r) => String(r.activityId) === String(activityId.value)) || null;
	} catch (e) {
		/* 查不到报名状态不影响看详情 */
	}
}

function onApply() {
	if (applied.value || submitting.value) return;

	// 先弹确认框，防止误点
	uni.showModal({
		title: '报名确认',
		content: '确定要报名该活动吗？',
		confirmText: '确认',
		cancelText: '取消',
		success: async (r) => {
			if (!r.confirm) return;
			submitting.value = true;
			try {
				await applyActivity(activityId.value);
				uni.showToast({ title: '报名成功', icon: 'success' });
				// 重新拉详情（人数会 +1）和报名状态（按钮变灰）
				await Promise.all([loadDetail(), loadApplyStatus()]);
			} catch (e) {
				uni.showToast({ title: e.message || '报名失败', icon: 'none' });
			} finally {
				submitting.value = false;
			}
		}
	});
}

onLoad((options) => {
	activityId.value = Number(options && options.id) || 1;
	loadDetail();
	loadApplyStatus();
});
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #f4f5f7;
	padding-top: 10rpx;
}

.detail-img {
	height: 360rpx;
}

.detail-text {
	display: block;
	-webkit-line-clamp: unset;
	overflow: visible;
	white-space: pre-wrap;
}

.apply-box {
	padding: 24rpx;
}

.apply-status {
	display: block;
	font-size: 24rpx;
	color: #888888;
	margin-bottom: 20rpx;
}
</style>
