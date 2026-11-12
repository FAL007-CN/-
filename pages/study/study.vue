<template>
	<view class="page">
		<!-- 顶部两个 Tab：学习感言 / 学习历史 -->
		<view class="dl-tabs">
			<view class="dl-tab" :class="{ active: tab === 'tail' }" @tap="tab = 'tail'">
				<text>学习感言</text>
			</view>
			<view class="dl-tab" :class="{ active: tab === 'history' }" @tap="tab = 'history'">
				<text>学习历史</text>
			</view>
		</view>

		<!-- =================== 一、学习感言 =================== -->
		<view v-if="tab === 'tail'">
			<view class="dl-form-box">
				<view class="dl-btn-line" @tap="tailFormOpen = !tailFormOpen">
					<text>{{ tailFormOpen ? '收起' : '+ 写学习感言' }}</text>
				</view>
				<view v-if="tailFormOpen" class="tail-form">
					<input class="dl-input" v-model="tailTitle" placeholder="感言标题" placeholder-class="ph" />
					<textarea class="dl-textarea" v-model="tailContent" placeholder="感言内容" placeholder-class="ph" />
					<view class="dl-btn-row">
						<view class="dl-btn" @tap="submitTail"><text>发布</text></view>
						<view class="dl-btn gray" @tap="cancelTail"><text>取消</text></view>
					</view>
				</view>
			</view>

			<view class="dl-card" v-for="t in tails" :key="t.id">
				<view class="dl-card-body">
					<text class="dl-card-title">{{ t.title }}</text>
					<text class="dl-card-meta">{{ t.createTime }}</text>
					<text class="dl-card-text dl-clamp-3">{{ t.content }}</text>
					<view class="dl-note-actions">
						<view class="dl-btn-sm red" @tap="removeTail(t.id)"><text>删除</text></view>
					</view>
				</view>
			</view>

			<view v-if="!tails.length" class="dl-empty">
				<text>{{ tailLoading ? '正在加载…' : '还没有感言，快来写一条吧' }}</text>
			</view>

			<view v-if="tails.length" class="dl-loadmore" :class="{ disabled: tailLoaded >= tailTotal }" @tap="moreTails">
				<text>{{ tailLoaded >= tailTotal ? '没有更多了' : '加载更多' }}</text>
			</view>
		</view>

		<!-- =================== 二、学习历史 =================== -->
		<view v-else>
			<view class="dl-card" v-for="h in history" :key="h.id">
				<view class="dl-card-body">
					<text class="dl-card-title">{{ h.title }}</text>
					<text class="dl-card-meta">发布时间：{{ h.issueTime }}</text>
					<text class="dl-card-text dl-clamp-3">{{ h.content }}</text>

					<!-- 已经有笔记：显示笔记 + 编辑/删除 -->
					<view v-if="h.wstudyNote && h.wstudyNote.noteId" class="dl-note">
						<text class="dl-note-title">{{ h.wstudyNote.noteTitle }}</text>
						<text class="dl-note-content">{{ h.wstudyNote.noteContent }}</text>
						<view class="dl-note-actions">
							<view class="dl-btn-sm" @tap="openNote('edit', h)"><text>编辑</text></view>
							<view class="dl-btn-sm red" @tap="removeNote(h)"><text>删除</text></view>
						</view>
					</view>

					<!-- 还没有笔记：显示添加按钮 -->
					<view v-else class="note-add">
						<view class="dl-btn-sm" @tap="openNote('add', h)"><text>添加笔记</text></view>
					</view>
				</view>
			</view>

			<view v-if="!history.length" class="dl-empty">
				<text>{{ hisLoading ? '正在加载…' : '暂无学习历史' }}</text>
			</view>

			<view v-if="history.length" class="dl-loadmore" :class="{ disabled: hisLoaded >= hisTotal }" @tap="moreHistory">
				<text>{{ hisLoaded >= hisTotal ? '没有更多了' : '加载更多' }}</text>
			</view>
		</view>

		<!-- =================== 笔记表单（底部弹出） =================== -->
		<view v-if="noteOpen" class="mask" @tap="noteOpen = false">
			<view class="sheet" @tap.stop>
				<text class="sheet-title">{{ noteMode === 'add' ? '给《' + curRow.title + '》添加笔记' : '编辑笔记' }}</text>
				<input class="dl-input" v-model="noteTitle" placeholder="笔记标题" placeholder-class="ph" />
				<textarea class="dl-textarea" v-model="noteContent" placeholder="笔记内容" placeholder-class="ph" />
				<view class="dl-btn-row">
					<view class="dl-btn" @tap="saveNote"><text>保存</text></view>
					<view class="dl-btn gray" @tap="noteOpen = false"><text>取消</text></view>
				</view>
				<view class="dl-safe-bottom"></view>
			</view>
		</view>

		<view class="dl-safe-bottom"></view>
	</view>
</template>

<script setup>
/**
 * ============================================================================
 * 学习心得 pages/study/study.vue（tab 页）
 * ----------------------------------------------------------------------------
 * 对应 html/study.html，是全项目接口最多的页面。
 *
 * 【学习感言】增删查
 *   GET    /api/testimonials/list
 *   POST   /api/testimonials        { title, content }
 *   DELETE /api/testimonials/{id}
 *
 * 【学习历史 + 笔记】增删改查
 *   GET    /api/history/list?userId=       ← userId 必填！
 *   POST   /api/history/note               { noteTitle, noteContent, studyHistoryId }
 *   PUT    /api/history/note               { noteId, noteTitle, noteContent }
 *   DELETE /api/history/note?noteId=&studyHistoryId=
 *
 * 【userId 从哪来？】
 * 学习历史接口必须传当前用户 id，所以进页面先查一次 /api/common/user/getInfo。
 * 这是原项目 study.html 踩过的坑，这里照旧保留。
 * ============================================================================
 */
import { ref, onMounted } from 'vue';
import {
	testimonialsList,
	addTestimonial,
	delTestimonial,
	historyList,
	addNote,
	updateNote,
	delNote,
	userInfo
} from '@/api/index.js';
import { STORAGE_KEYS } from '@/config/index.js';

const tab = ref('tail');
const userId = ref(0);

/* ------------------------------- 学习感言 ------------------------------- */
const tails = ref([]);
const tailPage = ref(1);
const TAIL_SIZE = 10;
const tailTotal = ref(0);
const tailLoaded = ref(0);
const tailLoading = ref(false);
const tailFormOpen = ref(false);
const tailTitle = ref('');
const tailContent = ref('');

async function loadTails(reset = false) {
	if (tailLoading.value) return;
	if (reset) {
		tailPage.value = 1;
		tailLoaded.value = 0;
		tails.value = [];
	}
	tailLoading.value = true;
	try {
		const res = await testimonialsList(tailPage.value, TAIL_SIZE);
		tailTotal.value = res.total || 0;
		const rows = res.rows || [];
		tails.value = tails.value.concat(rows);
		tailLoaded.value += rows.length;
	} catch (e) {
		uni.showToast({ title: e.message, icon: 'none' });
	} finally {
		tailLoading.value = false;
	}
}

function moreTails() {
	if (tailLoaded.value >= tailTotal.value) return;
	tailPage.value += 1;
	loadTails(false);
}

function cancelTail() {
	tailFormOpen.value = false;
	tailTitle.value = '';
	tailContent.value = '';
}

async function submitTail() {
	const title = tailTitle.value.trim();
	const content = tailContent.value.trim();
	if (!title) return uni.showToast({ title: '感言标题不能为空', icon: 'none' });
	if (!content) return uni.showToast({ title: '感言内容不能为空', icon: 'none' });

	try {
		await addTestimonial(title, content);
		uni.showToast({ title: '发布成功', icon: 'success' });
		cancelTail();
		loadTails(true);
	} catch (e) {
		uni.showToast({ title: e.message || '发布失败', icon: 'none' });
	}
}

function removeTail(id) {
	uni.showModal({
		title: '提示',
		content: '确定要删除这条感言吗？',
		confirmText: '删除',
		confirmColor: '#e53935',
		success: async (r) => {
			if (!r.confirm) return;
			try {
				await delTestimonial(id);
				uni.showToast({ title: '删除成功', icon: 'success' });
				loadTails(true);
			} catch (e) {
				uni.showToast({ title: e.message || '删除失败', icon: 'none' });
			}
		}
	});
}

/* ------------------------------- 学习历史 ------------------------------- */
const history = ref([]);
const hisPage = ref(1);
const HIS_SIZE = 10;
const hisTotal = ref(0);
const hisLoaded = ref(0);
const hisLoading = ref(false);

async function ensureUserId() {
	if (userId.value) return userId.value;
	// 优先用登录时缓存的
	const cached = uni.getStorageSync(STORAGE_KEYS.userInfo);
	if (cached && cached.userId) {
		userId.value = cached.userId;
		return userId.value;
	}
	const res = await userInfo();
	userId.value = (res.data && res.data.userId) || 0;
	uni.setStorageSync(STORAGE_KEYS.userInfo, res.data || {});
	return userId.value;
}

async function loadHistory(reset = false) {
	if (hisLoading.value) return;
	if (reset) {
		hisPage.value = 1;
		hisLoaded.value = 0;
		history.value = [];
	}
	hisLoading.value = true;
	try {
		const uid = await ensureUserId();
		const res = await historyList(uid, hisPage.value, HIS_SIZE);
		hisTotal.value = res.total || 0;
		const rows = res.rows || [];
		history.value = history.value.concat(rows);
		hisLoaded.value += rows.length;
	} catch (e) {
		uni.showToast({ title: e.message, icon: 'none' });
	} finally {
		hisLoading.value = false;
	}
}

function moreHistory() {
	if (hisLoaded.value >= hisTotal.value) return;
	hisPage.value += 1;
	loadHistory(false);
}

/* -------------------------------- 笔记 -------------------------------- */
const noteOpen = ref(false);
const noteMode = ref('add');
const noteTitle = ref('');
const noteContent = ref('');
const curRow = ref({});

function openNote(mode, row) {
	noteMode.value = mode;
	curRow.value = row;
	noteTitle.value = mode === 'edit' ? row.wstudyNote.noteTitle : '';
	noteContent.value = mode === 'edit' ? row.wstudyNote.noteContent : '';
	noteOpen.value = true;
}

async function saveNote() {
	const title = noteTitle.value.trim();
	const content = noteContent.value.trim();
	if (!title) return uni.showToast({ title: '笔记标题不能为空', icon: 'none' });
	if (!content) return uni.showToast({ title: '笔记内容不能为空', icon: 'none' });

	try {
		if (noteMode.value === 'add') {
			await addNote(title, content, curRow.value.id);
		} else {
			await updateNote(curRow.value.wstudyNote.noteId, title, content);
		}
		uni.showToast({ title: noteMode.value === 'add' ? '笔记已添加' : '笔记已修改', icon: 'success' });
		noteOpen.value = false;
		loadHistory(true);
	} catch (e) {
		uni.showToast({ title: e.message || '保存失败', icon: 'none' });
	}
}

function removeNote(row) {
	uni.showModal({
		title: '提示',
		content: '确定要删除这条笔记吗？',
		confirmText: '删除',
		confirmColor: '#e53935',
		success: async (r) => {
			if (!r.confirm) return;
			try {
				await delNote(row.wstudyNote.noteId, row.id);
				uni.showToast({ title: '删除成功', icon: 'success' });
				loadHistory(true);
			} catch (e) {
				uni.showToast({ title: e.message || '删除失败', icon: 'none' });
			}
		}
	});
}

/* -------------------------------- 启动 -------------------------------- */
onMounted(() => {
	loadTails(true);
	loadHistory(true);
});
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #f4f5f7;
	padding-bottom: 20rpx;
}

.tail-form {
	margin-top: 20rpx;
}

.note-add {
	margin-top: 16rpx;
}

.ph {
	color: #bbbbbb;
}

/* 底部弹出的笔记表单 */
.mask {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.45);
	z-index: 90;
	display: flex;
	align-items: flex-end;
}

.sheet {
	width: 100%;
	background: #ffffff;
	border-radius: 24rpx 24rpx 0 0;
	padding: 32rpx 28rpx 20rpx;
}

.sheet-title {
	display: block;
	font-size: 30rpx;
	font-weight: 600;
	color: #222222;
	margin-bottom: 24rpx;
}
</style>
