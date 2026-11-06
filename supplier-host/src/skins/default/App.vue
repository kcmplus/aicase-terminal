<template>
  <div class="w-full min-h-screen outline-none">
    <!-- Keep the terminal mounted during maintenance: one IPC / cloud worker. -->
    <Home v-show="route.name === 'home'" />
    <RouterView v-if="route.name !== 'home'" />
    <PasswordDialog v-model:visible="show_password_dialog" />
  </div>
</template>

<script setup lang="ts">

import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { logInfo } from '@/common/logger'
import { is_fullscreen, set_fullscreen, ui_keyboard_event } from '@/api/global';

import Home from './pages/Home.vue';
import PasswordDialog from '../components/PasswordDialog.vue';

import { clearPressed, handlePressPointerDown, handlePressPointerEnd, } from '@/skins/default/utils/pressFeedback';

const route = useRoute();


const is_dev = import.meta.env.DEV;

const show_password_dialog = ref(false);

let show_password_clicks = 0;
let show_password_timestamp = 0;


onMounted(async () => {
  logInfo("App mounted...")
  await initListeners();

})

onUnmounted(async () => {
  await killListeners();

})

const initListeners = async () => {
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('contextmenu', handleContextMenu);
  document.addEventListener('pointerup', handleClick);

  document.addEventListener('pointerdown', handlePressPointerDown, true);
  document.addEventListener('pointerup', handlePressPointerEnd, true);
  document.addEventListener('pointercancel', handlePressPointerEnd, true);
  window.addEventListener('blur', handlePressPointerEnd);
}

const killListeners = async () => {
  document.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('contextmenu', handleContextMenu);
  document.removeEventListener('pointerup', handleClick);

  document.removeEventListener('pointerdown', handlePressPointerDown, true);
  document.removeEventListener('pointerup', handlePressPointerEnd, true);
  document.removeEventListener('pointercancel', handlePressPointerEnd, true);
  window.removeEventListener('blur', handlePressPointerEnd);
  clearPressed();
}

const handleKeyDown = async (e: KeyboardEvent) => {
  if (!is_dev) {
    // F12 键
    if (e.key === "F12") {
      e.preventDefault();
      return false;
    }

    // Ctrl+Shift+I (开发者工具)
    if (e.ctrlKey && e.shiftKey && e.key === "I") {
      e.preventDefault();
      return false;
    }

    // Ctrl+Shift+J (控制台)
    if (e.ctrlKey && e.shiftKey && e.key === "J") {
      e.preventDefault();
      return false;
    }

    // Ctrl+Shift+C (检查元素)
    if (e.ctrlKey && e.shiftKey && e.key === "C") {
      e.preventDefault();
      return false;
    }

    // Ctrl+U (查看源代码)
    if (e.ctrlKey && e.key === "U") {
      e.preventDefault();
      return false;
    }
  }

  if (e.key === "F8") {
    show_password_dialog.value = !show_password_dialog.value;
    e.preventDefault();
    return false;
  } else if (e.key === "F11") {
    let fullscreen = await is_fullscreen();
    await set_fullscreen(!fullscreen)
    e.preventDefault();
    return false;
  } else if (e.key === "Escape") {
    await set_fullscreen(false)
    e.preventDefault();
    return false;
  }

  await ui_keyboard_event(e.key)
  return true;
}

const handleContextMenu = async (e: MouseEvent) => {
  if (!is_dev) {
    e.preventDefault();
    return false;
  }
  return true;
}

const handleClick = async (e: MouseEvent) => {
  await handleClicked(e.clientX, e.clientY);
  return true;
}

const CORNER_SIZE = 150;
const isInCorner = (x: number, y: number): boolean => {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  return x >= windowWidth - CORNER_SIZE && y >= windowHeight - CORNER_SIZE;
};

const handleClicked = async (x: number, y: number) => {
  if (!isInCorner(x, y)) {
    return;
  }
  const timestamp = Date.now();
  if (show_password_timestamp > 0 && timestamp - show_password_timestamp > 800) {
    show_password_clicks = 0;
  }
  show_password_clicks += 1;
  show_password_timestamp = timestamp;
  if (show_password_clicks >= 8) {
    show_password_clicks = 0;
    show_password_dialog.value = true
  }
}

</script>
