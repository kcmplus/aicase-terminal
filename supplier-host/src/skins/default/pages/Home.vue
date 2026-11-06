<script setup lang="ts">
import {onMounted,onUnmounted,ref} from 'vue';
import {mountPopomo} from '@/popomo/terminal.js';

const host=ref<HTMLElement|null>(null);
let terminal:ReturnType<typeof mountPopomo>|undefined;
onMounted(()=>{if(host.value)terminal=mountPopomo(host.value);});
onUnmounted(()=>terminal?.dispose());
</script>

<template><div ref="host" class="popomo-terminal" /></template>

<style scoped>
.popomo-terminal { height: 100dvh; overflow: auto; overscroll-behavior: contain; }
</style>
