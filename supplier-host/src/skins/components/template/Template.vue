<script setup lang="ts">
import { onMounted, ref, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { PcBrandItem, PcSeriesItem } from '@/api/pclib';
import { get_brands, get_series } from '@/api/product.ts';
import { logInfo } from '@/common/logger';
import { get_setting_options, SettingOptions } from '@/api/setting';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

// 公共引入
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

// for UI
const scrollContainer = ref<HTMLElement | null>(null);

function openXxxPopup() {

}

function closeAllPopups() {

}


async function onMountedUI() {
    // 注册UI事件，动画等UI交互逻辑
}

async function onUnmountedUI() {
    // 移除事件，关闭定时器，关闭提示，窗口
}


// for logic
const brands = ref<PcBrandItem[]>([]);
const series = ref<PcSeriesItem[]>([]);
const setting_options = ref<SettingOptions | null>(null);
let xxx_unlisten: UnlistenFn | null = null;

onMounted(async () => {
    logInfo("ModelList mounted...", route.query)

    // 获取路由参数，获取后端数据
    let brand_id = route.query.brand_id as string;
    brands.value = await get_brands();
    if (!brand_id && brands.value.length > 0) {
        brand_id = brands.value[0].brand_id;
    }
    series.value = await get_series(brand_id);

    setting_options.value = await get_setting_options()

    // 注册逻辑事件
    xxx_unlisten = await listen("xxxx", async (event) => {
       await update_qrcode_info()
    })
    // 首次初始化数据
    await update_qrcode_info();
    await update_upload_info();

    // 启动UI逻辑
    await onMountedUI();
});

onUnmounted(async () => {
    // 注册逻辑事件
    xxx_unlisten?.()

    // 清理UI逻辑
    await onUnmountedUI();
})


// UI交互事件处理
const onStartClicked = async () => {
    await handleNext()
}

const onBrandChanged = async () => {
    await handleBrandChanged()
}

const handleBrandChanged = async () => {

}

const handleNext = async () => {

}

// 处理返回/下一步/首页, 只做跳转参数处理
const gotoHome = async () => {

}

const gotoBack = async (params: any) => {

}

const gotoNext = async (params: any) => {
    const query = {
        //...
    }
    router.push({
        path: '/xxxxx',
        query: query
    });
}

// 更新数据
const update_qrcode_info = async () => {

}

const update_upload_info = async () => {

}

</script>

<template>
    <!-- View 内容 -->
</template>

<style scoped lang="less">
// CSS内容
</style>
