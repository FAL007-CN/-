<template>
	<view class="page">
		<view class="dl-news" v-for="n in list" :key="n.id">
			<image class="dl-news-img" :src="fullImg(n.imgUrl)" mode="aspectFill" />
			<view class="dl-news-info">
				<text class="dl-news-title">{{ n.title }}</text>
				<text class="dl-news-name">楷模：{{ n.name }}</text>
				<text class="dl-news-desc">{{ n.content }}</text>
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
 * 楷模列表 pages/model/model.vue
 * ----------------------------------------------------------------------------
 * 对应 html/model.html。接口：GET /api/model/list?pageNum=&pageSize=
 *
 * 【分页「加载更多」的固定套路（本项目所有列表页都一样）】
 *   第一次 pageNum=1 拉 10 条；
 *   点"加载更多" pageNum=2，把新 10 条接到数组后面；
 *   已加载条数 >= total 就把按钮变成"没有更多了"。
 * ============================================================================
 */
import { ref, onMounted } from 'vue';
import { modelList } from '@/api/index.js';
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
		const res = await modelList(pageNum.value, PAGE_SIZE);
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
	background: #ffffff;
}
</style>
