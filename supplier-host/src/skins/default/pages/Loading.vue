<template>
    <div class="loading-panel">
        <Transition name="fade">
            <div v-if="isVisible" class="thumbnail-loader-overlay">
                <div class="loader-container">
                    <!-- 动画 Logo -->
                    <div class="logo-animation">
                        <div class="spinner-ring">
                            <div v-for="dot in dots" :key="dot" class="dot" :style="{ '--i': dot }"></div>
                        </div>
                        <div class="center-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="3" y="3" width="7" height="7" rx="1" fill="#fff" opacity="0.9" />
                                <rect x="14" y="3" width="7" height="7" rx="1" fill="#fff" opacity="0.7" />
                                <rect x="3" y="14" width="7" height="7" rx="1" fill="#fff" opacity="0.7" />
                                <rect x="14" y="14" width="7" height="7" rx="1" fill="#fff" opacity="0.5" />
                            </svg>
                        </div>
                    </div>

                    <!-- 状态文本 -->
                    <div class="status-text">{{ loading.text }}</div>

                    <!-- 进度条 -->
                    <div class="progress-bar-container">
                        <div class="progress-bar">
                            <div class="progress-fill" :style="{ width: `${loading.percent}%` }"></div>
                        </div>
                        <div class="progress-percentage">{{ Math.round(loading.percent) }}%</div>
                    </div>

                    <!-- 提示文字 -->
                    <div class="hint-text">
                        Optimizing gallery for better performance
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">

import { ref, onMounted, onUnmounted } from 'vue';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

import { logInfo } from '@/common/logger';
import { LoadingInfo, UIEvent } from '@/api/global';

const isVisible = ref(true)
const dots = ref([0, 1, 2, 3, 4, 5, 6, 7]);

const loading = ref<LoadingInfo>({
    percent: 0.0,
    text: "loading..."
})

let loading_progress_unlisten: UnlistenFn | null = null

onMounted(async () => {
    logInfo("Loading mounted...")
    loading_progress_unlisten = await listen<LoadingInfo>(UIEvent.LOADING_PROGRESS, async (event) => {
        loading.value.percent = Math.floor(event.payload.percent * 100)
        loading.value.text = event.payload.text
    });
})

onUnmounted(async () => {
    loading_progress_unlisten?.()
});

</script>

<style scoped>
.loading-panel {
    background: transparent;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    gap: 10px;
}

.thumbnail-loader-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.loader-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
}

/* 动画 Logo */
.logo-animation {
    position: relative;
    width: 150px;
    height: 150px;
}

.spinner-ring {
    position: absolute;
    width: 100%;
    height: 100%;
    animation: spin 8s linear infinite;
}

.dot {
    position: absolute;
    width: 12px;
    height: 12px;
    background: #ff9f1c;
    border-radius: 50%;
    top: 50%;
    left: 50%;
    transform-origin: 0 0;
    transform: rotate(calc(var(--i) * 45deg)) translateX(60px);
    animation: pulse 1.5s ease-in-out infinite;
    animation-delay: calc(var(--i) * 0.1s);
    box-shadow: 0 0 10px #ff9f1c, 0 0 20px rgba(255, 159, 28, 0.5);
}

.center-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 60px;
    height: 60px;
    color: #fff;
    animation: iconPulse 2s ease-in-out infinite;
}

.center-icon svg {
    width: 100%;
    height: 100%;
}

/* 状态文本 */
.status-text {
    font-size: 1.5rem;
    font-weight: 600;
    color: #fff;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

/* 进度条 */
.progress-bar-container {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 400px;
}

.progress-bar {
    flex: 1;
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #ff9f1c 0%, #ffbf69 100%);
    border-radius: 4px;
    transition: width 0.3s ease;
    box-shadow: 0 0 10px rgba(255, 159, 28, 0.5);
}

.progress-percentage {
    font-size: 1.2rem;
    font-weight: 700;
    color: #ff9f1c;
    min-width: 60px;
    text-align: right;
}

/* 提示文字 */
.hint-text {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.05em;
}

/* 动画 */
@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

@keyframes pulse {

    0%,
    100% {
        opacity: 0.3;
        transform: rotate(calc(var(--i) * 45deg)) translateX(60px) scale(0.8);
    }

    50% {
        opacity: 1;
        transform: rotate(calc(var(--i) * 45deg)) translateX(60px) scale(1.2);
    }
}

@keyframes iconPulse {

    0%,
    100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 0.8;
    }

    50% {
        transform: translate(-50%, -50%) scale(1.1);
        opacity: 1;
    }
}

/* 淡出动画 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
