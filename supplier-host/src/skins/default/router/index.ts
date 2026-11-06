import { createRouter, createWebHashHistory } from 'vue-router';

import {hasAdminSession, clearAdminSession} from '@/common/admin-session';
import routesAdmin from "@/skins/admin/router";

const routes = [
    { path: '/', name: 'home', component: { render: () => null } },
    ...routesAdmin,
]

const router = createRouter({
    history: createWebHashHistory(),
    routes
})

router.beforeEach(to => {
    if (to.path === '/admin' || to.path.startsWith('/admin/')) {
        if (!hasAdminSession()) return '/';
    } else {
        clearAdminSession();
    }
});

export default router;
