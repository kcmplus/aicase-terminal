<script setup lang="ts">
import {onMounted,onUnmounted,ref} from 'vue';
import {mountPopomo} from '@/popomo/terminal.js';

const host=ref<HTMLElement|null>(null);
let terminal:ReturnType<typeof mountPopomo>|undefined;
const mount=()=>{terminal?.dispose();if(host.value)terminal=mountPopomo(host.value,{debug:import.meta.env.DEV||import.meta.env.VITE_DEVICE_DEBUG==='1'});};
onMounted(()=>{mount();if(import.meta.env.DEV&&import.meta.env.VITE_MOCK==='1')window.addEventListener('popomo:mock-reset',mount);});
onUnmounted(()=>{terminal?.dispose();window.removeEventListener('popomo:mock-reset',mount);});
</script>

<template><div ref="host" class="popomo-terminal" /></template>

<style scoped>
.popomo-terminal { height: 100dvh; overflow: auto; overscroll-behavior: contain; }
</style>
