<template>
	<view class="page">
		<!-- 头像 + 昵称 + 账号 -->
		<view class="dl-user-head">
			<image class="dl-user-avatar" :src="avatar || '/static/logo.png'" mode="aspectFill" />
			<view class="dl-user-info">
				<text class="dl-user-nick">{{ user.nickName || '未设置昵称' }}</text>
				<text class="dl-user-sub">账号：{{ user.userName || '—' }}</text>
			</view>
			<view class="dl-btn-sm" @tap="changeAvatar"><text>换头像</text></view>
		</view>

		<!-- 信息行 -->
		<view class="dl-user-rows">
			<view class="dl-user-row"><text class="dl-label">性别</text><text class="dl-value">{{ sexText }}</text></view>
			<view class="dl-user-row"><text class="dl-label">手机号</text><text class="dl-value">{{ user.phonenumber || '未填写' }}</text></view>
			<view class="dl-user-row"><text class="dl-label">邮箱</text><text class="dl-value">{{ user.email || '未填写' }}</text></view>
			<view class="dl-user-row"><text class="dl-label">证件号</text><text class="dl-value">{{ user.idCard || '未填写' }}</text></view>
			<view class="dl-user-row"><text class="dl-label">余额</text><text class="dl-value">{{ user.balance || 0 }} 元</text></view>
		</view>

		<!-- 快捷入口 -->
		<view class="dl-user-rows">
			<view class="dl-user-row" @tap="go('/pages/model/model')">
				<text class="dl-label">楷模列表</text><text class="dl-value">›</text>
			</view>
			<view class="dl-user-row" @tap="go('/pages/hero/hero')">
				<text class="dl-label">英雄故事</text><text class="dl-value">›</text>
			</view>
			<view class="dl-user-row" @tap="go('/pages/donation/donation')">
				<text class="dl-label">物资捐赠</text><text class="dl-value">›</text>
			</view>
		</view>

		<view class="btn-area">
			<view class="dl-btn red" @tap="doLogout"><text>退出登录</text></view>
		</view>

		<view class="dl-safe-bottom"></view>
	</view>
</template>

<script setup>
/**
 * ============================================================================
 * 个人中心 pages/user/user.vue
 * ----------------------------------------------------------------------------
 * 对应 html/user.html。三个接口：
 *   1. GET  /api/common/user/getInfo   查个人信息
 *   2. POST /common/upload             上传头像（multipart）
 *   3. POST /logout                    退出登录
 *
 * 【uni-app 上传文件和原项目不一样】
 *   原项目用 new FormData() + XMLHttpRequest；
 *   uni-app 直接用 uni.chooseImage + uni.uploadFile，两行搞定。
 * ============================================================================
 */
import { ref, computed, onMounted } from 'vue';
import { userInfo, uploadFile, logout } from '@/api/index.js';
import { fullImg, clearToken, getToken } from '@/utils/request.js';
import { STORAGE_KEYS } from '@/config/index.js';

const user = ref({});
const avatar = ref('');

const sexText = computed(() => {
	const s = String(user.value.sex);
	return s === '0' ? '男' : s === '1' ? '女' : '未知';
});

async function load() {
	try {
		const res = await userInfo();
		user.value = res.data || {};
		uni.setStorageSync(STORAGE_KEYS.userInfo, user.value);
		if (user.value.avatar) avatar.value = fullImg(user.value.avatar);
	} catch (e) {
		uni.showToast({ title: e.message, icon: 'none' });
	}
}

function changeAvatar() {
	uni.chooseImage({
		count: 1,
		sizeType: ['compressed'],
		sourceType: ['album', 'camera'],
		success: async (r) => {
			const path = r.tempFilePaths && r.tempFilePaths[0];
			if (!path) return;
			uni.showLoading({ title: '上传中…', mask: true });
			try {
				const out = await uploadFile(path);
				uni.hideLoading();
				avatar.value = out.url;
				uni.showToast({ title: '头像已更新', icon: 'success' });
			} catch (e) {
				uni.hideLoading();
				uni.showToast({ title: e.message || '上传失败', icon: 'none' });
			}
		}
	});
}

function go(url) {
	uni.navigateTo({ url });
}

function doLogout() {
	uni.showModal({
		title: '提示',
		content: '确定要退出登录吗？',
		success: async (r) => {
			if (!r.confirm) return;
			try {
				await logout();
			} catch (e) {
				/* 退出接口失败也要清本地凭证 */
			}
			clearToken();
			uni.reLaunch({ url: '/pages/login/login' });
		}
	});
}

onMounted(() => {
	if (!getToken()) {
		uni.reLaunch({ url: '/pages/login/login' });
		return;
	}
	load();
});
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #f4f5f7;
	padding-bottom: 20rpx;
}

.btn-area {
	padding: 40rpx 28rpx 20rpx;
}
</style>
