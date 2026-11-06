<template>
  <div v-if="displayType !== 'none'" class="media-layer">
    <!-- 单视频 -->
    <video v-if="displayType === 'video' && currentVideo" :key="currentVideo" class="media-layer__media"
      :src="resolveSrc(currentVideo)" autoplay muted loop playsinline />

    <!-- 单图 -->
    <img v-else-if="displayType === 'image' && currentImage" class="media-layer__media" :src="resolveSrc(currentImage)"
      alt="" />

    <!-- 多图轮播 -->
    <Swiper v-else-if="displayType === 'carousel'" class="media-layer__swiper" :modules="swiperModules" :loop="true"
      :autoplay="{
        delay: interval, disableOnInteraction: false,
        pauseOnMouseEnter: false
      }" :pagination="false" :allow-touch-move="false" @swiper="onSwiperReady">
      <SwiperSlide v-for="(src, index) in images" :key="`${src}-${index}`">
        <img class="media-layer__media" :src="resolveSrc(src)" alt="" />
      </SwiperSlide>
    </Swiper>
  </div>
</template>

<script setup lang="ts">

import 'swiper/css'
import 'swiper/css/pagination'

import { computed, ref, shallowRef, nextTick } from 'vue'
import { convertFileSrc } from '@tauri-apps/api/core'
import { Swiper, SwiperSlide } from 'swiper/vue'
import { Autoplay, Pagination } from 'swiper/modules'
import type { Swiper as SwiperInstance } from 'swiper'

/** 媒体展示形态 */
export type MediaDisplayType = 'none' | 'video' | 'image' | 'carousel'

export interface MediaLayerPayload {
  /** 展示形态；省略时根据 images / videos 自动推断 */
  displayType?: MediaDisplayType
  /** 轮播切换间隔（毫秒） */
  interval?: number
  images?: string[]
  videos?: string[]
}

const props = withDefaults(
  defineProps<{
    /** 挂载时是否自动拉取广告配置 */
    autoLoad?: boolean
  }>(),
  { autoLoad: true }
)

const DEFAULT_INTERVAL = 3000

const displayType = ref<MediaDisplayType>('none')
const images = ref<string[]>([])
const videos = ref<string[]>([])
const interval = ref(DEFAULT_INTERVAL)

const swiperModules = [Autoplay, Pagination]

const currentVideo = computed(() => videos.value[0] ?? '')
const currentImage = computed(() => images.value[0] ?? '')

/** 将本地文件路径转为可渲染地址；网络与 data URL 保持原样 */
function resolveSrc(src: string): string {
  if (!src) return ''
  if (/^(https?:|blob:|data:|asset:|tauri:)/i.test(src)) return src
  try {
    return convertFileSrc(src)
  } catch {
    return src
  }
}

const swiperInstance = shallowRef<SwiperInstance | null>(null)
function onSwiperReady(swiper: SwiperInstance) {
  swiperInstance.value = swiper
  restartCarousel()
}
function restartCarousel() {
  const swiper = swiperInstance.value
  if (!swiper || !swiper.autoplay) return
  swiper.autoplay.stop()
  setTimeout(() => {
    swiper.autoplay.start()
  }, 100)
}

/** 未指定 displayType 时，按资源数量推断展示形态 */
function inferDisplayType(payload: MediaLayerPayload): MediaDisplayType {
  if (payload.displayType) return payload.displayType
  const videoList = payload.videos ?? []
  const imageList = payload.images ?? []
  if (videoList.length > 0) return 'video'
  if (imageList.length > 1) return 'carousel'
  if (imageList.length === 1) return 'image'
  return 'none'
}

/** 写入媒体数据并刷新当前展示 */
function applyMediaPayload(payload: MediaLayerPayload) {
  displayType.value = inferDisplayType(payload)
  images.value = payload.images ?? []
  videos.value = payload.videos ?? []
  interval.value = payload.interval && payload.interval > 0 ? payload.interval : DEFAULT_INTERVAL
  nextTick(restartCarousel)
}

defineExpose({
  applyMediaPayload,
})
</script>

<style scoped>
.media-layer {
  position: fixed;
  inset: 0;
  z-index: 50;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  pointer-events: none;
}

.media-layer__swiper {
  width: 100%;
  height: 100%;
}

.media-layer__media {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

:deep(.swiper),
:deep(.swiper-wrapper),
:deep(.swiper-slide) {
  width: 100%;
  height: 100%;
}

:deep(.swiper-pagination-bullet) {
  background: #fff;
  opacity: 0.45;
}

:deep(.swiper-pagination-bullet-active) {
  opacity: 1;
}
</style>
