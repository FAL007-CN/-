/**
 * ============================================================================
 * 全局样式 App.vue
 * ----------------------------------------------------------------------------
 * 这里写的样式对「所有页面」生效，相当于原项目的 css/app.css。
 * 每张卡、每个按钮长得一样，靠的就是这些公共类。
 *
 * 【单位说明】
 * 项目里单位用 rpx：屏幕宽度永远是 750rpx。
 * 手机一般是 375 或 390 逻辑像素宽，所以 2rpx ≈ 1px。
 * 用 rpx 的好处：小屏大屏自动按比例缩放，不会出现「小米上挤成一团」。
 * ============================================================================
 */
<script>
export default {
	onLaunch() {
		// 启动时看一眼有没有登录过
		const token = uni.getStorageSync('token');
		const pages = getCurrentPages();
		const current = pages.length ? pages[pages.length - 1].route : '';
		if (!token && current !== 'pages/login/login') {
			uni.reLaunch({ url: '/pages/login/login' });
		}
	},
	onShow() {},
	onHide() {}
};
</script>

<style>
/* ---------------------------------------------------------------- 基础 */

page {
	background-color: #f4f5f7;
	color: #333;
	font-size: 28rpx;
	font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif;
	line-height: 1.5;
}

view,
text,
scroll-view,
image,
input,
textarea {
	box-sizing: border-box;
}

/**
 * 【一个很容易踩的坑】
 * uni-app 里 <text> 默认是「行内元素」，跟网页里的 <span> 一样。
 * 所以卡片里连续写 <text>标题</text><text>时间</text> 会挤在同一行，
 * 变成「标题2022-08-23」这种。这些文字行必须显式声明成块级，才会各占一行。
 */
.dl-card-title,
.dl-card-meta,
.dl-card-text,
.dl-news-title,
.dl-news-name,
.dl-news-desc,
.dl-note-title,
.dl-note-content,
.dl-chart-title,
.dl-chart-tip,
.dl-user-nick,
.dl-user-sub,
.dl-section > text,
.dl-loadmore,
.dl-empty {
	display: block;
}

/* ---------------------------------------------------------- 通用卡片 */

.dl-card {
	background: #ffffff;
	margin: 20rpx;
	border-radius: 16rpx;
	overflow: hidden;
	box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
}

.dl-card-img {
	display: block;
	width: 100%;
	height: 300rpx;
	background: #eaeaea;
}

.dl-card-body {
	padding: 20rpx 24rpx 24rpx;
}

.dl-card-title {
	font-size: 30rpx;
	font-weight: 600;
	line-height: 1.4;
	color: #222222;
}

.dl-card-meta {
	margin-top: 12rpx;
	font-size: 24rpx;
	color: #888888;
}

.dl-card-text {
	margin-top: 12rpx;
	font-size: 26rpx;
	line-height: 1.6;
	color: #555555;
}

/* 多行省略：2 行 / 3 行 */
.dl-clamp-2 {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}

.dl-clamp-3 {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
	overflow: hidden;
}

/* ------------------------------------------------------------ 小标题 */

.dl-section {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 28rpx 24rpx 16rpx;
	font-size: 30rpx;
	font-weight: 600;
	color: #333333;
}

.dl-section .dl-more {
	font-size: 24rpx;
	font-weight: normal;
	color: #888888;
}

/* -------------------------------------------------------------- 按钮 */

.dl-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 84rpx;
	border-radius: 8rpx;
	background: #1e88e5;
	color: #ffffff;
	font-size: 28rpx;
}

.dl-btn.gray {
	background: #9e9e9e;
}

.dl-btn.red {
	background: #e53935;
}

.dl-btn.disabled {
	background: #9e9e9e;
}

.dl-btn:active {
	opacity: 0.85;
}

.dl-btn-line {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 72rpx;
	border: 2rpx solid #1e88e5;
	border-radius: 8rpx;
	color: #1e88e5;
	font-size: 26rpx;
	background: #ffffff;
}

.dl-btn-sm {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 8rpx 20rpx;
	border-radius: 6rpx;
	background: #1e88e5;
	color: #ffffff;
	font-size: 24rpx;
	line-height: 1.4;
}

.dl-btn-sm.gray {
	background: #9e9e9e;
}

.dl-btn-sm.red {
	background: #e53935;
}

.dl-btn-sm:active {
	opacity: 0.85;
}

/* --------------------------------------------------- 加载更多 / 空状态 */

.dl-loadmore {
	padding: 28rpx 0;
	text-align: center;
	font-size: 26rpx;
	color: #1e88e5;
}

.dl-loadmore.disabled {
	color: #aaaaaa;
}

.dl-empty {
	padding: 80rpx 0;
	text-align: center;
	font-size: 26rpx;
	color: #999999;
}

/* ------------------------------------------------------------ 首页宫格 */

.dl-grid {
	display: flex;
	flex-wrap: wrap;
	background: #ffffff;
	padding: 20rpx 0 8rpx;
}

.dl-grid-item {
	width: 33.3333%;
	padding: 16rpx 0;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.dl-grid-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 92rpx;
	height: 92rpx;
	margin-bottom: 12rpx;
	border-radius: 50%;
	color: #ffffff;
	font-size: 40rpx;
}

.dl-grid-name {
	font-size: 24rpx;
	color: #444444;
}

.dl-c1 {
	background: #e53935;
}
.dl-c2 {
	background: #fb8c00;
}
.dl-c3 {
	background: #43a047;
}
.dl-c4 {
	background: #1e88e5;
}
.dl-c5 {
	background: #8e24aa;
}
.dl-c6 {
	background: #00897b;
}

/* ---------------------------------------------------------- 新闻条目 */

.dl-news {
	display: flex;
	padding: 20rpx 24rpx;
	background: #ffffff;
	border-bottom: 2rpx solid #f0f0f0;
}

.dl-news-img {
	width: 180rpx;
	height: 180rpx;
	flex-shrink: 0;
	border-radius: 12rpx;
	background: #eaeaea;
}

.dl-news-info {
	flex: 1;
	min-width: 0;
	margin-left: 20rpx;
}

.dl-news-title {
	font-size: 30rpx;
	font-weight: 600;
	line-height: 1.35;
	color: #222222;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}

.dl-news-name {
	margin-top: 8rpx;
	font-size: 24rpx;
	color: #1e88e5;
}

.dl-news-desc {
	margin-top: 8rpx;
	font-size: 24rpx;
	line-height: 1.5;
	color: #777777;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}

/* -------------------------------------------------------- 页面内 Tab */

.dl-tabs {
	display: flex;
	background: #ffffff;
	border-bottom: 2rpx solid #ececec;
}

.dl-tab {
	flex: 1;
	padding: 24rpx 0;
	text-align: center;
	font-size: 28rpx;
	color: #666666;
	border-bottom: 4rpx solid transparent;
}

.dl-tab.active {
	color: #1e88e5;
	border-bottom-color: #1e88e5;
	font-weight: 600;
}

/* -------------------------------------------------------------- 表单 */

.dl-form-box {
	background: #ffffff;
	margin: 20rpx;
	padding: 24rpx;
	border-radius: 16rpx;
}

.dl-field {
	display: flex;
	align-items: center;
	padding: 24rpx 0;
	border-bottom: 2rpx solid #eeeeee;
}

.dl-field-label {
	width: 124rpx;
	font-size: 28rpx;
	color: #555555;
}

.dl-field-input {
	flex: 1;
	font-size: 28rpx;
	color: #333333;
	height: 44rpx;
}

.dl-input {
	width: 100%;
	height: 76rpx;
	padding: 0 20rpx;
	margin-bottom: 16rpx;
	border: 2rpx solid #dddddd;
	border-radius: 8rpx;
	font-size: 28rpx;
	color: #333333;
	background: #fafafa;
}

.dl-textarea {
	width: 100%;
	height: 160rpx;
	padding: 16rpx 20rpx;
	margin-bottom: 16rpx;
	border: 2rpx solid #dddddd;
	border-radius: 8rpx;
	font-size: 28rpx;
	line-height: 1.5;
	color: #333333;
	background: #fafafa;
}

.dl-btn-row {
	display: flex;
}

.dl-btn-row .dl-btn {
	flex: 1;
}

.dl-btn-row .dl-btn + .dl-btn {
	margin-left: 20rpx;
}

/* -------------------------------------------------------------- 笔记 */

.dl-note {
	margin-top: 16rpx;
	padding: 16rpx 20rpx;
	background: #f3f8ff;
	border-left: 6rpx solid #1e88e5;
	border-radius: 0 8rpx 8rpx 0;
}

.dl-note-title {
	font-size: 26rpx;
	font-weight: 600;
	color: #1565c0;
}

.dl-note-content {
	margin-top: 6rpx;
	font-size: 24rpx;
	color: #555555;
	line-height: 1.5;
}

.dl-note-actions {
	margin-top: 12rpx;
	display: flex;
	justify-content: flex-end;
}

.dl-note-actions .dl-btn-sm {
	margin-left: 12rpx;
}

/* -------------------------------------------------------- 图表卡片 */

.dl-chart-card {
	background: #ffffff;
	margin: 20rpx;
	padding: 24rpx 20rpx;
	border-radius: 16rpx;
	box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
}

.dl-chart-title {
	display: block;
	font-size: 28rpx;
	font-weight: 600;
	color: #333333;
}

.dl-chart-tip {
	display: block;
	margin-top: 8rpx;
	font-size: 22rpx;
	color: #999999;
	line-height: 1.5;
}

/* -------------------------------------------------------- 个人中心 */

.dl-user-head {
	display: flex;
	align-items: center;
	padding: 36rpx 28rpx;
	background: #ffffff;
}

.dl-user-avatar {
	width: 128rpx;
	height: 128rpx;
	border-radius: 50%;
	background: #eaeaea;
}

.dl-user-info {
	margin-left: 28rpx;
	flex: 1;
	min-width: 0;
}

.dl-user-nick {
	font-size: 34rpx;
	font-weight: 600;
	color: #222222;
}

.dl-user-sub {
	margin-top: 8rpx;
	font-size: 24rpx;
	color: #888888;
}

.dl-user-rows {
	margin-top: 20rpx;
	background: #ffffff;
}

.dl-user-row {
	display: flex;
	justify-content: space-between;
	padding: 26rpx 28rpx;
	border-bottom: 2rpx solid #f2f2f2;
	font-size: 28rpx;
}

.dl-user-row .dl-label {
	color: #888888;
}

.dl-user-row .dl-value {
	color: #333333;
}

/* ---------------------------------------------------------- 小标签 */

.dl-tag {
	display: inline-flex;
	align-items: center;
	padding: 4rpx 16rpx;
	border-radius: 20rpx;
	font-size: 22rpx;
	color: #ffffff;
	background: #43a047;
}

.dl-tag.off {
	background: #9e9e9e;
}

/* ------------------------------------------------------ 底部安全区 */

.dl-safe-bottom {
	height: calc(env(safe-area-inset-bottom) + 20rpx);
}
</style>
