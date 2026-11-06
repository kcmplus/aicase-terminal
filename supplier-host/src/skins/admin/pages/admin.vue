<script setup lang="ts">
import { set_fullscreen } from '@/api/global'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const contentRef = ref<HTMLElement | null>(null)

const navItems = computed(() => [
  { name: 'system', label: t('admin.nav.system') },
  { name: 'payment', label: t('admin.nav.payment') },
  { name: 'print', label: t('admin.nav.print') },
  { name: 'channel', label: t('admin.nav.channel') },
  // { name: 'phonecase', label: t('admin.nav.phonecase') },
])

const handleNavClick = (name: string) => {
  router.replace(`/admin/${name}`)
}

const handleHome = () => {
  router.replace('/')
}

const isActive = (name: string) => {
  return route.name === `admin_${name}`
}

/** 子元素（如 el-card overflow:hidden）会截获滚轮，这里转发到内容区滚动 */
const handleContentWheel = (e: WheelEvent) => {
  const el = contentRef.value
  if (!el) return
  if (el.scrollHeight <= el.clientHeight) return

  const target = e.target as HTMLElement | null
  if (target?.closest('video, select, textarea, .el-select-dropdown, .el-scrollbar__wrap')) {
    return
  }

  el.scrollTop += e.deltaY
  e.preventDefault()
}

onMounted(async () => {
  contentRef.value?.addEventListener('wheel', handleContentWheel, { passive: false })
  await set_fullscreen(false)
})

onUnmounted(async () => {
  contentRef.value?.removeEventListener('wheel', handleContentWheel)
  await set_fullscreen(true)
})

</script>

<template>
  <div class="admin-shell h-screen bg-gray-100 flex flex-col overflow-hidden">
    <header class="admin-header bg-white shadow-md px-40 py-24 flex items-center flex-shrink-0">
      <button type="button"
        class="mr-16 w-48 h-48 flex items-center justify-center rounded-8 text-gray-700 hover:bg-gray-100 transition-colors"
        :aria-label="t('admin.shell.backHome')" @click="handleHome">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h1 class="text-32 font-bold text-gray-800">{{ t('admin.shell.title') }}</h1>
    </header>

    <nav class="admin-nav bg-white px-40 flex-shrink-0" style="border-bottom: 1px solid #ccc">
      <ul class="flex gap-32">
        <li v-for="item in navItems" :key="item.name" class="cursor-pointer" @click="handleNavClick(item.name)">
          <span class="text-18 px-20 py-10 rounded-8 transition-colors"
            :class="isActive(item.name) ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'">
            {{ item.label }}
          </span>
        </li>
      </ul>
    </nav>

    <div ref="contentRef" class="admin-content flex-1 min-h-0 overflow-y-auto p-10">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
@import '../styles/admin-landscape.css';

.admin-nav {
  padding-top: 16px;
  padding-bottom: 20px;
}

.admin-content {
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
</style>
