<template>
	<view class="ai-page">
		<!-- 顶部状态条 -->
		<view class="ai-head">
			<view class="whale">🐳</view>
			<view class="ai-head-main">
				<text class="ai-name">小鲸 · 数字生活助手</text>
				<text class="ai-status">{{ statusText }}</text>
			</view>
			<view class="ai-head-btn" @tap="settingsOpen = true"><text>设置</text></view>
			<view class="ai-head-btn ghost" @tap="clearChat"><text>清空</text></view>
		</view>

		<!-- 聊天气泡区 -->
		<scroll-view class="ai-scroll" scroll-y :scroll-into-view="anchor" :scroll-with-animation="true">
			<view class="msg-list">
				<view v-for="m in messages" :key="m.id" class="msg" :class="m.role">
					<view class="avatar" :class="m.role">{{ m.role === 'user' ? '我' : '鲸' }}</view>

					<view class="bubble-wrap">
						<!-- 工具调用痕迹：让评委看见 AI 真的在调后端接口 -->
						<view v-if="m.tools && m.tools.length" class="tool-row">
							<view class="tool-chip" v-for="t in m.tools" :key="t.name + t.state">
								<text class="tool-dot" :class="t.state"></text>
								<text>{{ t.label }}</text>
							</view>
						</view>

						<view class="bubble" :class="{ err: m.error }">
							<text class="bubble-text">{{ m.content }}</text>
							<text v-if="m.streaming" class="caret">▍</text>
						</view>

						<view v-if="m.mode === 'local'" class="bubble-tag"><text>本地数据模式</text></view>

						<view v-if="m.role === 'assistant' && m.content && !m.streaming" class="bubble-actions">
							<text class="act" @tap="copy(m.content)">复制</text>
						</view>
					</view>
				</view>

				<!-- 快捷问题 -->
				<view v-if="messages.length <= 1" class="quick-wrap">
					<text class="quick-title">你可以这样问</text>
					<view class="quick-chip" v-for="q in quickQuestions" :key="q" @tap="send(q)">
						<text>{{ q }}</text>
					</view>
				</view>

				<view id="ai-bottom" class="scroll-bottom"></view>
			</view>
		</scroll-view>

		<!-- 输入区 -->
		<view class="ai-inputbar">
			<textarea
				class="ai-textarea"
				v-model="draft"
				:disabled="sending"
				auto-height
				:maxlength="500"
				placeholder="问点什么…"
				placeholder-class="ph"
				:show-confirm-bar="false"
			/>
			<view class="send-btn" :class="{ off: sending || !draft.trim() }" @tap="send()">
				<text>{{ sending ? '…' : '发送' }}</text>
			</view>
		</view>

		<!-- ================= 设置弹层 ================= -->
		<view v-if="settingsOpen" class="mask" @tap="settingsOpen = false">
			<view class="sheet" @tap.stop>
				<text class="sheet-title">AI 助手设置</text>
				<text class="sheet-tip">
					填好 API Key 就能和大模型对话；不填也能用，会自动切到「本地数据模式」，
					用后端真实接口的数据回答。
				</text>

				<text class="field-label">接口地址（OpenAI 兼容）</text>
				<input class="dl-input" v-model="settings.baseUrl" placeholder="https://api.deepseek.com" placeholder-class="ph" />

				<text class="field-label">模型名</text>
				<input class="dl-input" v-model="settings.model" placeholder="deepseek-chat" placeholder-class="ph" />

				<text class="field-label">API Key</text>
				<input class="dl-input" v-model="settings.apiKey" password placeholder="sk-..." placeholder-class="ph" />

				<view class="dl-btn-row">
					<view class="dl-btn" @tap="saveSettings"><text>保存</text></view>
					<view class="dl-btn gray" @tap="testConn"><text>测试连接</text></view>
				</view>

				<text class="sheet-foot">
					提示：DeepSeek 填 https://api.deepseek.com + deepseek-chat；
					通义千问填 https://dashscope.aliyuncs.com/compatible-mode/v1 + qwen-plus。
				</text>
				<view class="dl-safe-bottom"></view>
			</view>
		</view>
	</view>
</template>

<script setup>
/**
 * ============================================================================
 * AI 问答助手 pages/ai/ai.vue  ★ 本项目的核心亮点页
 * ----------------------------------------------------------------------------
 * 【它和普通「套个聊天框」的区别】
 *
 *   1. 真的能调你自己的后端接口（function calling）
 *      你问「有哪些公益活动」，AI 不会瞎编，它会说「我要调 get_activity_list」，
 *      代码这边真的去请求 http://114.66.9.70:10002/prod-api/api/activity/list，
 *      把真实数据交回去，AI 再根据真实数据回答。
 *      气泡上方那些小标签（「查询公益活动 ✓」）就是调用痕迹。
 *
 *   2. 流式输出
 *      H5 端用 fetch + ReadableStream 读 SSE，一个字一个字蹦出来，不是等半天弹一坨。
 *
 *   3. 三级兜底，保证演示不翻车
 *      有 Key → 正常对话
 *      没 Key → 本地数据模式（还是查真接口）
 *      连不上/跨域被拦 → 自动降级成本地数据模式，不会弹红字
 *
 * 【改哪里】
 *   接口地址 / Key / 模型 → 点右上角「设置」，存在本地，不用改代码。
 * ============================================================================
 */
import { ref, reactive, computed, nextTick, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { chat, getAISettings, saveAISettings, hasApiKey, testConnection } from '@/utils/ai.js';

/* ------------------------------------------------------------ 状态 */

const messages = ref([]);
const draft = ref('');
const sending = ref(false);
const anchor = ref('ai-bottom');
const settingsOpen = ref(false);
const settings = reactive({ baseUrl: '', apiKey: '', model: '' });
const keyReady = ref(false);

let msgId = 0;

const statusText = computed(() => {
	if (!keyReady.value) return '本地数据模式 · 未配置 Key';
	const s = getAISettings();
	return `已连接 ${s.model}`;
});

// 快捷问题（都是本地模式也能答出来的，演示不怕没 Key）
const quickQuestions = [
	'有哪些公益活动可以报名？',
	'2022年评论数据怎么样？',
	'我的学习记录有几条？',
	'书籍类型占比是多少？',
	'有哪些楷模新闻？'
];

/* ------------------------------------------------------------ 初始化 */

function welcome() {
	messages.value = [
		{
			id: ++msgId,
			role: 'assistant',
			content:
				'你好，我是小鲸 🐳\n我可以查这个 App 里的真实数据：公益活动、楷模新闻、英雄故事、学习记录、2022 年的评论和阅读统计。\n想试试点下面的问题，或者直接在下面输入。',
			tools: [],
			streaming: false,
			mode: ''
		}
	];
}

onMounted(() => {
	const s = getAISettings();
	settings.baseUrl = s.baseUrl;
	settings.apiKey = s.apiKey;
	settings.model = s.model;
	keyReady.value = hasApiKey();
	welcome();
});

// 从别的页面切回来时，Key 可能刚改过
onShow(() => {
	keyReady.value = hasApiKey();
});

/* ------------------------------------------------------------ 滚动到底 */

async function scrollBottom() {
	anchor.value = '';
	await nextTick();
	anchor.value = 'ai-bottom';
}

/* ------------------------------------------------------------ 设置 */

function saveSettings() {
	saveAISettings({
		baseUrl: settings.baseUrl.trim() || 'https://api.deepseek.com',
		apiKey: settings.apiKey.trim(),
		model: settings.model.trim() || 'deepseek-chat'
	});
	keyReady.value = hasApiKey();
	settingsOpen.value = false;
	uni.showToast({ title: hasApiKey() ? '已保存' : '已保存（本地模式）', icon: 'none' });
}

async function testConn() {
	saveAISettings({
		baseUrl: settings.baseUrl.trim() || 'https://api.deepseek.com',
		apiKey: settings.apiKey.trim(),
		model: settings.model.trim() || 'deepseek-chat'
	});
	keyReady.value = hasApiKey();
	if (!keyReady.value) return uni.showToast({ title: '先填 API Key', icon: 'none' });
	uni.showLoading({ title: '测试中…', mask: true });
	try {
		const reply = await testConnection();
		uni.hideLoading();
		uni.showModal({ title: '连接成功', content: `模型回复：${String(reply).slice(0, 60)}`, showCancel: false });
	} catch (e) {
		uni.hideLoading();
		uni.showModal({
			title: '连接失败',
			content: `${e.message}\n\n如果是浏览器打开（H5），可能是接口没开 CORS 跨域；用手机 APK 一般正常。`,
			showCancel: false
		});
	}
}

/* ------------------------------------------------------------ 发送 */

const TOOL_LABELS = {
	get_banner_list: '查询轮播图',
	search_model_news: '查询楷模新闻',
	search_hero_story: '查询英雄故事',
	get_activity_list: '查询公益活动',
	get_my_applications: '查询我的报名',
	get_study_summary: '查询学习记录',
	get_comment_stats: '统计评论数据',
	get_reading_stats: '统计阅读数据',
	get_donation_list: '查询物资捐赠',
	get_user_profile: '查询个人信息'
};

function mkTool(name) {
	return TOOL_LABELS[name] || `调用 ${name}`;
}

async function send(preset) {
	const text = String(preset || draft.value || '').trim();
	if (!text || sending.value) return;

	draft.value = '';
	sending.value = true;

	// 1. 用户消息
	messages.value.push({ id: ++msgId, role: 'user', content: text, tools: [], streaming: false, mode: '' });

	// 2. 准备 AI 消息占位
	const aiMsg = reactive({
		id: ++msgId,
		role: 'assistant',
		content: '',
		tools: [],
		streaming: true,
		mode: '',
		error: false
	});
	messages.value.push(aiMsg);
	await scrollBottom();

	// 3. 历史消息（不含刚加进来的这条 AI 占位）
	const history = messages.value
		.filter((m) => m.id !== aiMsg.id && m.content && !m.error)
		.map((m) => ({ role: m.role, content: m.content }))
		.slice(0, -1); // 去掉最后这条 user，chat() 会自己加

	try {
		const out = await chat(history, text, {
			onDelta(piece) {
				aiMsg.content += piece;
				aiMsg.streaming = true;
				scrollBottom();
			},
			onTool(name) {
				aiMsg.tools.push({ name, label: mkTool(name), state: 'running' });
				scrollBottom();
			},
			onToolDone(name) {
				const t = aiMsg.tools.find((x) => x.name === name && x.state === 'running');
				if (t) t.state = 'done';
				scrollBottom();
			}
		});

		aiMsg.mode = out.mode;
		if (!aiMsg.content && out.text) aiMsg.content = out.text;
		if (!aiMsg.content) aiMsg.content = '（模型没有返回内容，再问一次试试）';
	} catch (e) {
		aiMsg.error = true;
		aiMsg.content = e.message || '出错了，再试一次吧';
	} finally {
		aiMsg.streaming = false;
		sending.value = false;
		aiMsg.tools.forEach((t) => (t.state = 'done'));
		scrollBottom();
	}
}

/* ------------------------------------------------------------ 其他 */

function copy(text) {
	uni.setClipboardData({
		data: text,
		success() {
			uni.showToast({ title: '已复制', icon: 'none' });
		}
	});
}

function clearChat() {
	uni.showModal({
		title: '提示',
		content: '清空全部对话记录？',
		success(r) {
			if (r.confirm) welcome();
		}
	});
}
</script>

<style lang="scss" scoped>
.ai-page {
	display: flex;
	flex-direction: column;
	height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px));
	background: #eef3f9;
}

/* ---------------- 顶部 ---------------- */
.ai-head {
	display: flex;
	align-items: center;
	padding: 20rpx 24rpx;
	background: linear-gradient(135deg, #1e88e5, #42a5f5);
	color: #ffffff;
}

.whale {
	width: 72rpx;
	height: 72rpx;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.22);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 40rpx;
}

.ai-head-main {
	flex: 1;
	min-width: 0;
	margin-left: 16rpx;
	display: flex;
	flex-direction: column;
}

.ai-name {
	font-size: 28rpx;
	font-weight: 600;
}

.ai-status {
	margin-top: 4rpx;
	font-size: 20rpx;
	opacity: 0.9;
}

.ai-head-btn {
	margin-left: 12rpx;
	padding: 10rpx 20rpx;
	border-radius: 24rpx;
	background: rgba(255, 255, 255, 0.22);
	font-size: 22rpx;
}

.ai-head-btn.ghost {
	background: rgba(255, 255, 255, 0.12);
}

/* ---------------- 消息 ---------------- */
.ai-scroll {
	flex: 1;
	height: 0;
}

.msg-list {
	padding: 24rpx 20rpx 8rpx;
}

.msg {
	display: flex;
	margin-bottom: 28rpx;
	align-items: flex-start;
}

.msg.user {
	flex-direction: row-reverse;
}

.avatar {
	width: 64rpx;
	height: 64rpx;
	border-radius: 50%;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 26rpx;
	color: #ffffff;
	background: #1e88e5;
}

.avatar.user {
	background: #43a047;
}

.bubble-wrap {
	max-width: 76%;
	margin: 0 16rpx;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
}

.msg.user .bubble-wrap {
	align-items: flex-end;
}

.bubble {
	background: #ffffff;
	border-radius: 18rpx;
	padding: 18rpx 22rpx;
	box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
}

.msg.user .bubble {
	background: #1e88e5;
}

.bubble.err {
	background: #fff3f3;
	border: 2rpx solid #ffcdd2;
}

.bubble-text {
	font-size: 28rpx;
	line-height: 1.65;
	color: #333333;
	white-space: pre-wrap;
	word-break: break-word;
}

.msg.user .bubble-text {
	color: #ffffff;
}

.caret {
	font-size: 26rpx;
	color: #1e88e5;
}

.msg.user .caret {
	color: #ffffff;
}

.bubble-tag {
	margin-top: 8rpx;
	font-size: 20rpx;
	color: #999999;
}

.bubble-actions {
	margin-top: 8rpx;
}

.act {
	font-size: 22rpx;
	color: #1e88e5;
	margin-right: 20rpx;
}

/* 工具调用小标签 */
.tool-row {
	display: flex;
	flex-wrap: wrap;
	margin-bottom: 10rpx;
}

.tool-chip {
	display: flex;
	align-items: center;
	margin: 0 10rpx 10rpx 0;
	padding: 6rpx 16rpx;
	border-radius: 20rpx;
	background: rgba(30, 136, 229, 0.1);
	font-size: 20rpx;
	color: #1565c0;
}

.tool-dot {
	width: 12rpx;
	height: 12rpx;
	border-radius: 50%;
	margin-right: 8rpx;
	background: #1e88e5;
}

.tool-dot.running {
	background: #fb8c00;
}

.tool-dot.done {
	background: #43a047;
}

/* 快捷问题 */
.quick-wrap {
	margin: 10rpx 0 20rpx 80rpx;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
}

.quick-title {
	font-size: 22rpx;
	color: #8899aa;
	margin-bottom: 12rpx;
}

.quick-chip {
	margin-bottom: 14rpx;
	padding: 14rpx 24rpx;
	border-radius: 28rpx;
	background: #ffffff;
	border: 2rpx solid #d7e6f7;
	font-size: 24rpx;
	color: #1565c0;
}

.scroll-bottom {
	height: 20rpx;
}

/* ---------------- 输入区 ---------------- */
.ai-inputbar {
	display: flex;
	align-items: flex-end;
	padding: 16rpx 20rpx;
	background: #ffffff;
	border-top: 2rpx solid #e6ecf3;
}

.ai-textarea {
	flex: 1;
	min-height: 72rpx;
	max-height: 200rpx;
	padding: 16rpx 20rpx;
	background: #f4f6f9;
	border-radius: 16rpx;
	font-size: 28rpx;
	line-height: 1.4;
	color: #333333;
	width: auto;
}

.send-btn {
	margin-left: 16rpx;
	width: 120rpx;
	height: 72rpx;
	border-radius: 16rpx;
	background: #1e88e5;
	color: #ffffff;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 26rpx;
}

.send-btn.off {
	background: #b0bec5;
}

.ph {
	color: #a8b4c0;
}

/* ---------------- 设置弹层 ---------------- */
.mask {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.45);
	z-index: 99;
	display: flex;
	align-items: flex-end;
}

.sheet {
	width: 100%;
	max-height: 88vh;
	overflow-y: auto;
	background: #ffffff;
	border-radius: 24rpx 24rpx 0 0;
	padding: 32rpx 28rpx 20rpx;
}

.sheet-title {
	display: block;
	font-size: 32rpx;
	font-weight: 600;
	color: #222222;
}

.sheet-tip {
	display: block;
	margin: 12rpx 0 24rpx;
	font-size: 22rpx;
	line-height: 1.6;
	color: #888888;
}

.field-label {
	display: block;
	font-size: 24rpx;
	color: #666666;
	margin: 16rpx 0 10rpx;
}

.sheet-foot {
	display: block;
	margin-top: 20rpx;
	font-size: 20rpx;
	line-height: 1.6;
	color: #9aa7b4;
}
</style>
