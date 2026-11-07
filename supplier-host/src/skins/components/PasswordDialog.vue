<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { gsap } from 'gsap';
import Keyboard from './keyboard.vue';
import { get_setting_options } from '@/api/setting.ts';
import {grantAdminSession} from '@/common/admin-session';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const { t } = useI18n();
const router = useRouter();

const password_input = ref('');
const password_error = ref(false);
const dialogRef = ref<HTMLDivElement | null>(null);
const overlayRef = ref<HTMLDivElement | null>(null);

let passwordDialogOpenTime = 0;
const DIALOG_PROTECT_MS = 800;
let currentAnimation: gsap.core.Timeline | null = null;

const cancelPassword = () => {
  if (Date.now() - passwordDialogOpenTime < DIALOG_PROTECT_MS) {
    return;
  }
  emit('update:visible', false);
  password_input.value = '';
  password_error.value = false;
};

const deleteKey = () => {
  password_input.value = password_input.value.slice(0, -1);
  password_error.value = false;
};

const verifyPassword = async () => {
  let password: string | undefined;
  try { password = (await get_setting_options())?.device_password || '168168'; } catch { /* Fail closed while disconnected. */ }
  if (!password || password_input.value !== password) {
    password_error.value = true;
    password_input.value = '';
    return;
  }
  emit('update:visible', false);
  password_input.value = '';
  password_error.value = false;
  grantAdminSession();
  router.push('/admin');
};

const animateOpen = () => {
  if (currentAnimation) {
    currentAnimation.kill();
  }

  if (!overlayRef.value || !dialogRef.value) return;

  gsap.set(overlayRef.value, {
    opacity: 0,
    pointerEvents: 'auto'
  });
  gsap.set(dialogRef.value, {
    opacity: 0,
    scale: 0.9,
    y: 30,
    pointerEvents: 'auto'
  });

  currentAnimation = gsap.timeline({})
    .to(overlayRef.value, {
      opacity: 1,
      duration: 0.3,
      ease: 'power2.out'
    }, 0)
    .to(dialogRef.value, {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.4,
      ease: 'back.out(1.5)'
    }, 0);
};

const animateClose = () => {
  if (currentAnimation) {
    currentAnimation.kill();
  }

  if (!overlayRef.value || !dialogRef.value) return;

  currentAnimation = gsap.timeline({})
    .to(overlayRef.value, {
      opacity: 0,
      duration: 0.2,
      ease: 'power2.in',
      onComplete: () => {
        if (overlayRef.value) {
          gsap.set(overlayRef.value, { pointerEvents: 'none' });
        }
      }
    }, 0)
    .to(dialogRef.value, {
      opacity: 0,
      scale: 0.9,
      y: 30,
      duration: 0.2,
      ease: 'power2.in',
      onComplete: () => {
        if (dialogRef.value) {
          gsap.set(dialogRef.value, { pointerEvents: 'none' });
        }
      }
    }, 0);
};

watch(() => props.visible, (newValue) => {
  if (newValue) {
    passwordDialogOpenTime = Date.now();
    password_input.value = '';
    password_error.value = false;
    animateOpen();
  } else {
    animateClose();
  }
});

onMounted(() => {
  if (!overlayRef.value || !dialogRef.value) return;

  gsap.set(overlayRef.value, {
    opacity: 0,
    pointerEvents: 'none'
  });
  gsap.set(dialogRef.value, {
    opacity: 0,
    scale: 0.9,
    y: 30,
    pointerEvents: 'none'
  });

  if (props.visible) {
    animateOpen();
  }
});
</script>

<template>
  <div ref="overlayRef" role="dialog" :aria-label="t('password.title')" aria-modal="true"
    :aria-hidden="!visible" :inert="!visible"
    class="fixed inset-0 flex items-center justify-center z-[99999999]"
    :class="{ 'pointer-events-auto': visible }">
    <div class="absolute inset-0 bg-black/60" @click="cancelPassword"></div>
    <div ref="dialogRef"
      class="relative bg-white rounded-2xl p-30 w-[min(720px,calc(100vw-32px))] shadow-2xl text-center">
      <button class="absolute top-4 right-4 cursor-pointer" @click="cancelPassword">
        <img src="../admin/static/close.png" class="w-40 h-40" alt="">
      </button>
      <h3 class="text-[20px] text-gray-800 mb-20">{{ t('password.title') }}</h3>
      <div class="mb-15">
        <input type="text" readonly :value="'*'.repeat(password_input.length)"
          class="w-full min-h-[56px] px-4 py-3 border-2 border-gray-300 rounded-xl text-[20px] tracking-widest text-gray-800 bg-gray-50 text-center cursor-default placeholder:text-gray-400 placeholder:tracking-normal placeholder:text-[16px] rounded-[10px]!"
          :class="{ 'border-red-500 animate-shake': password_error, 'border-orange-400': visible }"
          :placeholder="t('password.placeholder')" />
      </div>
      <p v-if="password_error" class="text-red-500 text-[14px] mb-2">{{ t('password.error') }}</p>
      <Keyboard type="numeric" v-model="password_input" :max-length="8" @delete="deleteKey" @confirm="verifyPassword" />
    </div>
  </div>
</template>

<style scoped>
@keyframes shake {

  0%,
  100% {
    transform: translateX(0);
  }

  25% {
    transform: translateX(-8px);
  }

  75% {
    transform: translateX(8px);
  }
}

.animate-shake {
  animation: shake 0.3s ease-in-out;
}
</style>
