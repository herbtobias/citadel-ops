// Redirects unauthenticated users to /login. Public routes are exempt.
const PUBLIC = new Set([
  '/login',
  '/register',
  '/accept-invite',
  '/forgot-password',
  '/reset-password',
])

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  if (!loggedIn.value && !PUBLIC.has(to.path)) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
  if (loggedIn.value && to.path === '/login') {
    return navigateTo('/')
  }
})
