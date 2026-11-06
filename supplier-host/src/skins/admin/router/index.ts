const routesAdmin = [
    {
        path: '/admin',
        name: 'admin',
        component: () => import('../pages/admin.vue'),
        children: [
            { path: 'system', name: 'admin_system', component: () => import('../pages/children/system.vue') },
            { path: 'payment', name: 'admin_payment', component: () => import('../pages/children/payment.vue') },
            { path: 'channel', name: 'admin_channel', component: () => import('../pages/children/channel.vue') },
            { path: 'print', name: 'admin_print', component: () => import('../pages/children/print.vue') },
            // { path: 'phonecase', name: 'admin_phonecase', component: () => import('../pages/children/phonecase.vue') },
            { path: '', name: 'admin_index', redirect: '/admin/system' }
        ]
    }
]

export default routesAdmin;
