<template>
	<view class="page">
		<view class="dl-card" v-for="d in list" :key="d.id">
			<image class="dl-card-img item-img" :src="fullImg(d.imgUrl)" mode="aspectFill" />
			<view class="dl-card-body">
				<text class="dl-card-title">{{ d.content }}</text>
				<text class="dl-card-meta">捐赠人：{{ d.donationUser }}　数量：{{ d.number }} 件</text>
				<text class="dl-card-meta">捐赠日期：{{ d.donationDate }}</text>
			</view>
		</view>

		<view v-if="!list.length" class="dl-empty">
			<text>{{ loading ? '正在加载…' : '暂无数据' }}</text>
		</view>

		<view v-if="list.length" class="dl-loadmore" :class="{ disabled: loaded >= total }" @tap="loadMore">
			<text>{{ loaded >= total ? '没有更多了' : '加载更多' }}</text>
		</view>
	</view>
</template>

<script setup>
/**
 * ============================================================================
 * 物资捐赠 pages/donation/donation.vue
 * ----------------------------------------------------------------------------
 * 对应 html/donation.html。接口：GET /api/donation/list
 * ============================================================================
 */
import { ref, onMounted } from 'vue';
import { donationList } from '@/api/index.js';
import { fullImg } from '@/utils/request.js';

const list = ref([]);
const pageNum = ref(1);
const PAGE_SIZE = 10;
const total = ref(0);
const loaded = ref(0);
const loading = ref(false);

async function load() {
	if (loading.value) return;
	loading.value = true;
	try {
		const res = await donationList(pageNum.value, PAGE_SIZE);
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
	load();
}

onMounted(load);
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #f4f5f7;
}

.item-img {
	height: 280rpx;
}
</style>
