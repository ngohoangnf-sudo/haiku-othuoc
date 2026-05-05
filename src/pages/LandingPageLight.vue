<template>
  <div class="content content--offset">
    <div class="content__item" style="--aspect-ratio: 10/75">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._1 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">Đọc</h2>
      <div class="content__item-description">
        <p>haiku nhật</p>
        <p>haiku việt</p>
        <p>haiku thế giới</p>
      </div>
      <div class="content__item-poem grid g3">
        <a
          aria-label="link-3"
          target="_blank"
          rel="noopener"
          draggable="false"
          class="link w-inline-block --color-link"
        >
          <p
            v-for="(line, index) in featuredPoem.lines"
            :key="index"
            class="right landing-page-light__poem-line"
          >
            {{ line }}
          </p>
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
      <h2 class="content__item-title content__item-title--layer">Viết</h2>
    </div>
    <div class="content__item" style="--aspect-ratio: 30/60">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._3 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">Nghĩ</h2>
      <div class="content__item-description">
        <p>nghiên cứu</p>
        <p>bình luận</p>
      </div>
    </div>
    <div class="content__item" style="--aspect-ratio: 700/300">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._4 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">Haiku ≠</h2>
    </div>
    <div class="content__item" style="--aspect-ratio: 500/545">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._5 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">Thư Viện</h2>
      <div class="content__item-description">
        <p>giới thiệu sách</p>
        <p>ebook</p>
        <p>mượn sách giấy</p>
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
import "assets/imagesloaded.pkgd.min.js";
import { initLandingPage } from "assets/landing_page.js";
import "assets/js/TweenLite.min.js";
import "assets/js/Math.js";
import { API_BASE, resolveMediaUrl } from "src/utils/runtime";

export default defineComponent({
  name: "LandingPageLight",
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

<style>
body {
  margin: 0;
  /* --color-text: #686E67; */
  --color-text: #6e635f !important;
  /* --color-text: #b1a59f; */
  --color-bg: #fff !important;
  --color-link: #000;
  --color-link-hover: #b1a189;
}
</style>

<style scoped>
.landing-page-light__poem-line {
  width: 100%;
  max-width: 100%;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
