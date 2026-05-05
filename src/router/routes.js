const routes = [
  {
    path: "/",
    component: () => import("layouts/MainLayout.vue"),
    children: [{ path: "", component: () => import("pages/LandingPage.vue") }],
  },

  {
    path: "/read",
    component: () => import("layouts/MainLayout.vue"),
    children: [
      { path: "", redirect: "jp" },
      { path: "jp", component: () => import("pages/ReadingPage.vue") },
      { path: "vi", component: () => import("pages/ReadingPage.vue") },
      { path: "global", component: () => import("pages/ReadingPage.vue") },
    ],
  },

  {
    path: "/write",
    component: () => import("layouts/MainLayout.vue"),
    children: [
      { path: "", component: () => import("pages/WritingPage.vue") },
    ],
  },

  {
    path: "/login",
    component: () => import("layouts/MainLayout.vue"),
    children: [{ path: "", component: () => import("pages/LoginPage.vue") }],
  },

  {
    path: "/admin",
    component: () => import("layouts/MainLayout.vue"),
    children: [
      {
        path: "",
        component: () => import("pages/AdminPage.vue"),
        meta: { requiresAdmin: true },
      },
    ],
  },

  {
    path: "/profile",
    component: () => import("layouts/MainLayout.vue"),
    children: [
      {
        path: "",
        component: () => import("pages/ProfilePage.vue"),
        meta: { requiresEditor: true },
      },
    ],
  },

  {
    path: "/authors",
    component: () => import("layouts/MainLayout.vue"),
    children: [
      { path: "", component: () => import("pages/AuthorPage.vue") },
      { path: ":slug", component: () => import("pages/AuthorPage.vue") },
    ],
  },

  {
    path: "/haiku-number",
    redirect: "/haiku-khac",
  },

  {
    path: "/haiku-khac",
    component: () => import("layouts/MainLayout.vue"),
    children: [
      { path: "", component: () => import("pages/HaikuOtherPage.vue") },
      { path: ":slug", component: () => import("pages/HaikuOtherPostPage.vue") },
    ],
  },

  {
    path: "/library",
    component: () => import("layouts/MainLayout.vue"),
    children: [
      {
        path: "",
        component: () => import("pages/ComingSoonPage.vue"),
        meta: {
          title: "Thư viện",
          message: "Không gian lưu trữ và tra cứu đang được xây dựng. Coming soon.",
        },
      },
    ],
  },

  {
    path: "/essays",
    component: () => import("layouts/MainLayout.vue"),
    children: [
      { path: "", component: () => import("pages/EssaysPage.vue") },
      { path: ":slug", component: () => import("pages/EssayPage.vue") },
    ],
  },

  {
    path: "/post/:id",
    component: () => import("layouts/MainLayout.vue"),
    children: [{ path: "", component: () => import("pages/PostPage.vue") }],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: "/:catchAll(.*)*",
    component: () => import("pages/ErrorNotFound.vue"),
  },
];

export default routes;
