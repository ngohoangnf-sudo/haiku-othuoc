<template>
  <div class="content content--offset">
    <div class="content__item" style="--aspect-ratio: 10/75">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._1 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">
        <router-link to="/read/jp">Đọc</router-link>
      </h2>
      <div class="content__item-description">
        <router-link to="/read/jp" class="link"><p> haiku nhật</p></router-link>
        <router-link to="/read/vi" class="link"><p>haiku việt</p></router-link>
        <router-link to="/read/global" class="link"><p>haiku thế giới</p></router-link>
      </div>
      <div class="content__item-poem grid g3">
        <a
          aria-label="link-3"
          target="_blank"
          rel="noopener"
          draggable="false"
          class="link w-inline-block -col-or-link"
        >
          <p v-for="(line, index) in featuredPoem.lines" :key="index">{{ line }}</p>
          <img class="" :src="featuredPoem.image" alt="" aria-hidden="true" crossorigin="anonymous" />
        </a>
      </div>
    </div>

    <!-- <div></div> -->
    <div class="content__item" style="--aspect-ratio: 700/200">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._2 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer"><router-link to="/write">Viết</router-link></h2>
      
    </div>
    <div class="content__item" style="--aspect-ratio: 30/60">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._3 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">
        <router-link to="/essays">Nghĩ</router-link>
      </h2>
      <div class="content__item-description">
        <router-link :to="{ path: '/essays', query: { kind: 'research' } }" class="link"><p>nghiên cứu</p></router-link>
        <router-link :to="{ path: '/essays', query: { kind: 'commentary' } }" class="link"><p>bình luận</p></router-link>
      </div>
    </div>
    <div class="content__item" style="--aspect-ratio: 700/300">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._4 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">
        <router-link to="/haiku-number">Haiku#</router-link>
      </h2>
    </div>
    <div class="content__item" style="--aspect-ratio: 500/545">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._5 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">
        <router-link to="/library">Thư Viện</router-link>
      </h2>
      <div class="content__item-description">
        <router-link to="/library" class="link"><p>giới thiệu sách</p></router-link>
        <router-link to="/library" class="link"><p>ebook</p></router-link>
        <router-link to="/library" class="link"><p>mượn sách giấy</p></router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, nextTick } from "vue";
import _1 from "assets/1.jpg";
import _2 from "assets/2.jpg";
import _3 from "assets/3.jpg";
import _4 from "assets/4.jpg";
import _5 from "assets/5.jpg";
import _7 from "assets/7.jpg";
import { initLandingPage } from "assets/landing_page.js";
import { API_BASE, resolveMediaUrl } from "src/utils/runtime";

export default defineComponent({
  name: "LandingPage",
  async mounted() {
    await this.fetchFeaturedPoem();
    await nextTick();
    this.cleanupLandingPage = initLandingPage();
  },
  beforeUnmount() {
    this.cleanupLandingPage?.();
  },
  props: {
    title: {
      type: String,
      required: false,
    },

    caption: {
      type: String,
      default: "",
    },

    link: {
      type: String,
      default: "#",
    },

    icon: {
      type: String,
      default: "",
    },
  },
  data() {
    return {
      cleanupLandingPage: null,
      featuredPoem: {
        lines: ["đường phố không hắt bóng", "dưới mắt đèn đường hỏng", "chỗ trú loài chim đêm"],
        image: _7,
      },
      images: {
        _1,
        _2,
        _3,
        _4,
        _5,
        _7,
      },
    };
  },
  methods: {
    async fetchFeaturedPoem() {
      try {
        const res = await fetch(`${API_BASE}/posts/random`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data?.image || !Array.isArray(data?.lines) || !data.lines.length) {
          return;
        }

        this.featuredPoem = {
          lines: data.lines,
          image: resolveMediaUrl(data.image),
        };
      } catch (err) {
        console.error("Không tải được bài thơ landing", err);
      }
    },
  },
});
</script>
