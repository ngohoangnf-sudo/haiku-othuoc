const routes = [
  {
    path: "/",
    component: () => import("layouts/MainLayout.vue"),
    children: [{ path: "", component: () => import("pages/LandingPage.vue") }],
  },

  {
    path: "/light",
    component: () => import("layouts/MainLayout.vue"),
    children: [
      { path: "", component: () => import("pages/LandingPageLight.vue") },
    ],
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
    path: "/authors",
    component: () => import("layouts/MainLayout.vue"),
    children: [
      { path: "", component: () => import("pages/AuthorPage.vue") },
      { path: ":slug", component: () => import("pages/AuthorPage.vue") },
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
