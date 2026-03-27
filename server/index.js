const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const db = require("./db");

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/posts", (req, res) => {
  try {
    const posts = db.getAllPosts({
      category: req.query.category,
      authorSlug: req.query.authorSlug,
    });
    res.json(posts);
  } catch (err) {
    console.error("Lỗi lấy posts", err);
    res.status(500).json({ message: "Không lấy được danh sách bài viết" });
  }
});

app.get("/api/posts/:id", (req, res) => {
  try {
    const post = db.getPostById(req.params.id);
    if (!post) return res.status(404).json({ message: "Không tìm thấy bài" });
    res.json(post);
  } catch (err) {
    console.error("Lỗi lấy post", err);
    res.status(500).json({ message: "Không lấy được bài viết" });
  }
});

app.post("/api/posts", (req, res) => {
  try {
    const input = req.body || {};
    const lines = Array.isArray(input.lines)
      ? input.lines.filter((l) => l && String(l).trim())
      : [];

    if (!lines.length) {
      return res.status(400).json({ message: "Cần ít nhất một dòng haiku" });
    }

    const now = new Date().toISOString();
    const post = {
      id: input.id || randomUUID(),
      title: input.title || "Haiku mới",
      author: input.author || "Vô danh",
      authorSlug: input.authorSlug || slugify(input.author || "vo-danh"),
      category: input.category || "vi",
      lines,
      summary: input.summary || "",
      image: input.image || "",
      publishedAt: input.publishedAt || now.split("T")[0],
      createdAt: now,
      updatedAt: now,
    };

    const created = db.insertPost(post);
    res.status(201).json(created);
  } catch (err) {
    console.error("Lỗi tạo post", err);
    res.status(500).json({ message: "Không tạo được bài viết" });
  }
});

app.get("/api/authors", (_req, res) => {
  try {
    const authors = db.getAuthors();
    res.json(authors);
  } catch (err) {
    console.error("Lỗi lấy authors", err);
    res.status(500).json({ message: "Không lấy được danh sách tác giả" });
  }
});

const SEED_POSTS = [
  {
    id: "seed-basho-1",
    title: "Gửi gió Edo",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: [
      "Bỏ lên chiếc quạt nhỏ",
      "Từ Phú Sĩ gửi đi ngọn gió",
      "Một chút quà Edo",
    ],
    image: "fuji.jpg",
    summary: "Haiku cổ điển của Basho, nhắc đến núi Phú Sĩ và Edo.",
    publishedAt: "2023-09-01",
    createdAt: "2023-09-01T00:00:00.000Z",
    updatedAt: "2023-09-01T00:00:00.000Z",
  },
  {
    id: "seed-shohaka-1",
    title: "Tia nắng cuối",
    author: "Shohaka",
    authorSlug: "shohaka",
    category: "jp",
    lines: ["Trong sương mờ bóng tối", "Tia nắng cuối lung linh"],
    image: "poppy.jpg",
    summary: "Khoảnh khắc cuối ngày giữa sương và ánh sáng.",
    publishedAt: "2023-08-18",
    createdAt: "2023-08-18T00:00:00.000Z",
    updatedAt: "2023-08-18T00:00:00.000Z",
  },
  {
    id: "seed-sogi-1",
    title: "Giọt sương",
    author: "Sogi",
    authorSlug: "sogi",
    category: "jp",
    lines: [
      "Giọt sương buồn phiền",
      "Và cũng đau cho nỗi",
      "Bông hoa ở lại sau mình",
    ],
    image: "",
    summary: "Một haiku về nỗi niềm của giọt sương và bông hoa.",
    publishedAt: "2023-07-11",
    createdAt: "2023-07-11T00:00:00.000Z",
    updatedAt: "2023-07-11T00:00:00.000Z",
  },
  {
    id: "seed-kyorai-1",
    title: "Anh túc nở",
    author: "Kyorai",
    authorSlug: "kyorai",
    category: "jp",
    lines: ["Đã ra khơi", "Ngư phủ – Bên bờ biển", "Anh túc nở hoa tươi"],
    image: "poppy.jpg",
    summary: "Không khí bờ biển giữa mùa anh túc.",
    publishedAt: "2023-08-02",
    createdAt: "2023-08-02T00:00:00.000Z",
    updatedAt: "2023-08-02T00:00:00.000Z",
  },
  {
    id: "seed-basho-2",
    title: "Tiếng ve",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: [
      "Chẳng bao lâu sẽ chết",
      "Nhưng chưa thấy dấu hiệu nào hết",
      "Ve kêu không mỏi mệt",
    ],
    image: "",
    summary: "Âm thanh ve sầu và cảm nhận về thời gian.",
    publishedAt: "2023-06-21",
    createdAt: "2023-06-21T00:00:00.000Z",
    updatedAt: "2023-06-21T00:00:00.000Z",
  },
  {
    id: "seed-basho-3",
    title: "Mùa thu này",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: [
      "Rồi đến mùa Thu này",
      "Sao ta lại già đi như vầy?",
      "Cánh chim bay về mây?",
    ],
    image: "",
    summary: "Một thoáng suy tư về mùa thu và tuổi tác.",
    publishedAt: "2023-09-30",
    createdAt: "2023-09-30T00:00:00.000Z",
    updatedAt: "2023-09-30T00:00:00.000Z",
  },
  {
    id: "seed-basho-4",
    title: "Quạt giấy rách",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: [
      "Viết để lại đôi dòng",
      "Chiếc quạt giấy bỗng rách một đường",
      "Dấu vết lòng vấn vương?",
    ],
    image: "",
    summary: "Một hình ảnh nhỏ về quạt giấy và ký ức.",
    publishedAt: "2023-05-09",
    createdAt: "2023-05-09T00:00:00.000Z",
    updatedAt: "2023-05-09T00:00:00.000Z",
  },
  {
    id: "seed-hiep-1",
    title: "Mùa rêu xanh",
    author: "Nguyễn Vũ Hiệp",
    authorSlug: "nguyen-vu-hiep",
    category: "vi",
    lines: ["Đắp thêm mùa rêu xanh", "đá vẫn lạnh", "cùng thiên thanh"],
    image: "",
    summary: "Sự tĩnh lặng của đá và rêu.",
    publishedAt: "2024-01-10",
    createdAt: "2024-01-10T00:00:00.000Z",
    updatedAt: "2024-01-10T00:00:00.000Z",
  },
  {
    id: "seed-hiep-2",
    title: "Tịch liêu",
    author: "Nguyễn Vũ Hiệp",
    authorSlug: "nguyen-vu-hiep",
    category: "vi",
    lines: ["Tịch liêu", "chảy qua gối những", "bình minh màu chiều"],
    image: "",
    summary: "Hình ảnh tịch liêu chảy qua thời gian.",
    publishedAt: "2024-01-15",
    createdAt: "2024-01-15T00:00:00.000Z",
    updatedAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "seed-hiep-3",
    title: "Ký ức mưa",
    author: "Nguyễn Vũ Hiệp",
    authorSlug: "nguyen-vu-hiep",
    category: "vi",
    lines: [
      "Trở lạnh",
      "cơn giận dài lung lay",
      "trong mưa ký ức bay",
    ],
    image: "",
    summary: "Những cơn mưa kéo dài ký ức.",
    publishedAt: "2024-01-20",
    createdAt: "2024-01-20T00:00:00.000Z",
    updatedAt: "2024-01-20T00:00:00.000Z",
  },
  {
    id: "seed-hieu-1",
    title: "Mưa xuân ngủ",
    author: "Đỗ Trung Hiếu",
    authorSlug: "do-trung-hieu",
    category: "vi",
    lines: ["Tiếng bà ru", "mưa xuân ngủ", "lá bàng non"],
    image: "",
    summary: "Hình ảnh bà ru và lá bàng non trong mưa xuân.",
    publishedAt: "2024-02-05",
    createdAt: "2024-02-05T00:00:00.000Z",
    updatedAt: "2024-02-05T00:00:00.000Z",
  },
  {
    id: "seed-hieu-2",
    title: "Ngón tay",
    author: "Đỗ Trung Hiếu",
    authorSlug: "do-trung-hieu",
    category: "vi",
    lines: ["Ngón tay", "trượt trên những chiếc bóng ", "chữ nhật"],
    image: "",
    summary: "Động tác ngón tay và bóng chữ nhật.",
    publishedAt: "2024-02-10",
    createdAt: "2024-02-10T00:00:00.000Z",
    updatedAt: "2024-02-10T00:00:00.000Z",
  },
  {
    id: "seed-ngo-1",
    title: "Anh giao hàng",
    author: "Ngô Hoàng",
    authorSlug: "ngo-hoang",
    category: "vi",
    lines: [
      "anh giao hàng đến muộn",
      "mặt trời vã mồ hôi",
      "từ hộp canh đánh đổ",
    ],
    image: "",
    summary: "Khoảnh khắc đời thường của người giao hàng.",
    publishedAt: "2024-03-01",
    createdAt: "2024-03-01T00:00:00.000Z",
    updatedAt: "2024-03-01T00:00:00.000Z",
  },
  {
    id: "seed-ngo-2",
    title: "Gió bơi",
    author: "Ngô Hoàng",
    authorSlug: "ngo-hoang",
    category: "vi",
    lines: ["gió bơi giữa trời", "giấu nắng trong mây", "chờ trăng tới lấy"],
    image: "",
    summary: "Gió, nắng và trăng đuổi nhau trên bầu trời.",
    publishedAt: "2024-03-06",
    createdAt: "2024-03-06T00:00:00.000Z",
    updatedAt: "2024-03-06T00:00:00.000Z",
  },
  {
    id: "seed-ngo-3",
    title: "Mười vầng trăng",
    author: "Ngô Hoàng",
    authorSlug: "ngo-hoang",
    category: "vi",
    lines: [
      "trăng mọc mười vầng",
      "trên tòa cao ốc",
      "một vầng dịu lặn",
      "khuất vào thinh không",
    ],
    image: "",
    summary: "Trăng soi trên cao ốc và biến mất vào tĩnh lặng.",
    publishedAt: "2024-03-12",
    createdAt: "2024-03-12T00:00:00.000Z",
    updatedAt: "2024-03-12T00:00:00.000Z",
  },
];

const VI_SEED_IMAGE_POOL = [
  "1.jpg",
  "2.jpg",
  "3.jpg",
  "4.jpg",
  "5.jpg",
  "7.jpg",
  "8.jpg",
  "9.jpg",
  "10.jpg",
  "71.jpg",
  "72.jpg",
];

function hashString(value = "") {
  return [...value].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7);
}

function assignVietnameseSeedImages(posts = []) {
  return posts.map((post) => {
    if (post.category !== "vi" || post.image) {
      return post;
    }

    const image = VI_SEED_IMAGE_POOL[hashString(post.id) % VI_SEED_IMAGE_POOL.length];
    return {
      ...post,
      image,
    };
  });
}

const seededPosts = assignVietnameseSeedImages(SEED_POSTS);
const seededVietnameseImageMap = Object.fromEntries(
  seededPosts
    .filter((post) => post.category === "vi" && post.image)
    .map((post) => [post.id, post.image])
);

db.seedIfEmpty(seededPosts);
db.assignImagesIfMissing(seededVietnameseImageMap);

app.use("/api/data", express.static(path.resolve(__dirname, "data")));

const SPA_DIST = path.resolve(__dirname, "..", "dist", "spa");

if (fs.existsSync(SPA_DIST)) {
  app.use(express.static(SPA_DIST));
  // Fallback cho mọi route không phải /api/*
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(SPA_DIST, "index.html"));
  });
} else {
  console.warn("Không tìm thấy dist/spa, chỉ phục vụ API. Hãy chạy build trước.");
}

app.listen(PORT, () => {
  console.log(`Haiku API server chạy tại http://localhost:${PORT}`);
});

function slugify(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}
