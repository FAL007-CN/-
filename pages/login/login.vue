<template>
	<view class="login-page">
		<!-- 顶部标题 -->
		<view class="login-logo">
			<text class="cn">数字生活</text>
			<text class="en">DIGITAL LIFE</text>
		</view>

		<!-- 登录白卡片 -->
		<view class="login-box">
			<view class="login-tabs">
				<view class="login-tab" :class="{ active: loginType === 'user' }" @tap="loginType = 'user'">
					<text>账号登录</text>
				</view>
				<view class="login-tab" :class="{ active: loginType === 'phone' }" @tap="loginType = 'phone'">
					<text>手机号登录</text>
				</view>
			</view>

			<!-- 账号密码 -->
			<view v-if="loginType === 'user'">
				<view class="dl-field">
					<text class="dl-field-label">账号</text>
					<input class="dl-field-input" v-model="form.user" placeholder="请输入账号" placeholder-class="ph" />
				</view>
				<view class="dl-field">
					<text class="dl-field-label">密码</text>
					<input class="dl-field-input" v-model="form.pwd" password placeholder="请输入密码" placeholder-class="ph" />
				</view>
			</view>

			<!-- 手机号 -->
			<view v-else>
				<view class="dl-field">
					<text class="dl-field-label">手机号</text>
					<input class="dl-field-input" v-model="form.phone" type="number" placeholder="请输入手机号" placeholder-class="ph" />
				</view>
				<view class="dl-field">
					<text class="dl-field-label">密码</text>
					<input class="dl-field-input" v-model="form.phonePwd" password placeholder="请输入密码" placeholder-class="ph" />
				</view>
			</view>

			<view class="dl-btn login-btn" :class="{ disabled: loading }" @tap="submit">
				<text>{{ loading ? '登录中…' : '登 录' }}</text>
			</view>

			<text class="login-tip">默认测试账号：test01 / 123456</text>
		</view>

		<view class="login-foot">
			<text>uni-app · Vue3 版 · 数据来自数字生活开放接口</text>
		</view>
	</view>
</template>

<script setup>
/**
 * ============================================================================
 * 登录页 pages/login/login.vue
 * ----------------------------------------------------------------------------
 * 对应原项目 index.html。
 *
 * 【登录到底在做什么】
 *   1. 把账号密码 POST 给 /api/login
 *   2. 服务器说 code=200，并给我们一个 token
 *   3. 把 token 存到本地存储（相当于"通行证"）
 *   4. 跳进首页。之后每个接口都会在请求头带上这个 token，服务器就认得我们了。
 * ============================================================================
 */
import { ref, reactive, onMounted } from 'vue';
import { login, phoneLogin, userInfo } from '@/api/index.js';
import { setToken, getToken } from '@/utils/request.js';
import { STORAGE_KEYS } from '@/config/index.js';

const loginType = ref('user'); // user=账号登录，phone=手机号登录
const loading = ref(false);

const form = reactive({
	user: 'test01',
	pwd: '123456',
	phone: '',
	phonePwd: ''
});

onMounted(() => {
	// 已经登录过就别停在登录页了
	if (getToken()) {
		uni.reLaunch({ url: '/pages/index/index' });
	}
});

function toast(msg) {
	uni.showToast({ title: msg, icon: 'none', duration: 2000 });
}

async function submit() {
	if (loading.value) return;

	// 1. 先做本地校验，空着就不用麻烦服务器了
	let payloadCheck = '';
	if (loginType.value === 'user') {
		if (!form.user.trim()) payloadCheck = '账号不能为空';
		else if (!form.pwd.trim()) payloadCheck = '密码不能为空';
	} else {
		if (!form.phone.trim()) payloadCheck = '手机号不能为空';
		else if (!form.phonePwd.trim()) payloadCheck = '密码不能为空';
	}
	if (payloadCheck) {
		toast(payloadCheck);
		return;
	}

	loading.value = true;
	try {
		// 2. 调接口
		const res =
			loginType.value === 'user'
				? await login(form.user.trim(), form.pwd.trim())
				: await phoneLogin(form.phone.trim(), form.phonePwd.trim());

		// 3. 存 token
		setToken(res.token);

		// 4. 顺手把用户信息也存下来（其他页面可以直接用，不用每次都查）
		try {
			const info = await userInfo();
			uni.setStorageSync(STORAGE_KEYS.userInfo, info.data || {});
		} catch (e) {
			/* 查不到也没关系，不影响登录 */
		}

		uni.showToast({ title: '登录成功', icon: 'success', duration: 800 });
		setTimeout(() => {
			uni.reLaunch({ url: '/pages/index/index' });
		}, 500);
	} catch (e) {
		toast(e.message || '登录失败，请检查账号密码');
	} finally {
		loading.value = false;
	}
}
</script>

<style lang="scss" scoped>
.login-page {
	min-height: 100vh;
	background: linear-gradient(160deg, #1e88e5 0%, #42a5f5 45%, #e3f2fd 100%);
	padding: 140rpx 44rpx 60rpx;
	display: flex;
	flex-direction: column;
}

.login-logo {
	display: flex;
	flex-direction: column;
	align-items: center;
	margin-bottom: 52rpx;
	color: #ffffff;
}

.login-logo .cn {
	font-size: 52rpx;
	font-weight: 700;
	letter-spacing: 4rpx;
}

.login-logo .en {
	margin-top: 12rpx;
	font-size: 24rpx;
	letter-spacing: 6rpx;
	opacity: 0.85;
}

.login-box {
	background: #ffffff;
	border-radius: 24rpx;
	padding: 12rpx 36rpx 40rpx;
	box-shadow: 0 12rpx 44rpx rgba(0, 0, 0, 0.12);
}

.login-tabs {
	display: flex;
	margin-bottom: 20rpx;
}

.login-tab {
	flex: 1;
	padding: 28rpx 0 20rpx;
	text-align: center;
	font-size: 30rpx;
	color: #888888;
	border-bottom: 4rpx solid transparent;
}

.login-tab.active {
	color: #1e88e5;
	border-bottom-color: #1e88e5;
	font-weight: 600;
}

.login-btn {
	margin-top: 44rpx;
}

.login-tip {
	display: block;
	margin-top: 24rpx;
	font-size: 24rpx;
	color: #999999;
	text-align: center;
}

.login-foot {
	margin-top: auto;
	padding-top: 60rpx;
	text-align: center;
	font-size: 22rpx;
	color: rgba(255, 255, 255, 0.75);
}

.ph {
	color: #bbbbbb;
}
</style>
