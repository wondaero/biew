<script setup lang="ts">
import UpdateBanner from '@/components/UpdateBanner.vue'
import LoginDialog from '@/components/LoginDialog.vue'
import { loginRequest } from '@/lib/loginPrompt'
</script>

<template>
  <RouterView />
  <UpdateBanner />
  <!-- 공용 로그인 팝업(requireLogin) — 다른 팝업 위에 겹쳐 뜬다 -->
  <LoginDialog v-if="loginRequest" />
</template>
