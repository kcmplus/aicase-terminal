import {defineConfig} from 'vite';

export default defineConfig({
  base:'./',
  publicDir:false,
  build:{
    target:'es2022',
    outDir:'supplier-host/src/popomo',
    emptyOutDir:true,
    lib:{entry:'src/embedded.ts',formats:['es'],fileName:()=> 'terminal.js'},
  },
});
