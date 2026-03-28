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
          <p>đường phố không hắt bóng</p>
          <p>dưới mắt đèn đường hỏng</p>
          <p>chỗ trú loài chim đêm</p>
          <img class="" :src="images._7" alt="img7" />
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
      <h2 class="content__item-title content__item-title--layer">Haiku#</h2>
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
import { defineComponent } from "vue";
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

export default defineComponent({
  name: "LandingPage",
  mounted() {
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
});
</script>
