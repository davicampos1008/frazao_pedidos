import {defineConfig } from 'vite'
import React from '@vitejs/plugin-React'
import tailwindcss from '@tailwindcss/vite'

//https://vitejs.dev/config/
export default defineConfig ({
    Plugin: [
        React(),
        tailwindcss(),
    ],
})