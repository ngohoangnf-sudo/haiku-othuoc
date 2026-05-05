export const HAIKU_OTHER_CATEGORIES = [
  {
    value: "multimedia",
    label: "Haiku đa phương tiện",
    description: "Workshop hoặc dự án liên quan đến haiku dưới các hình hài khác.",
  },
  {
    value: "haiku-like",
    label: "Hình như haiku",
    description: "Thơ của các tác giả không viết haiku nhưng có tinh thần haiku.",
  },
  {
    value: "aiku",
    label: "AIku",
    description: "Bài viết và tổng hợp thơ do AI làm.",
  },
];

export function normalizeHaikuOtherCategory(value = "") {
  return HAIKU_OTHER_CATEGORIES.some((item) => item.value === value)
    ? value
    : HAIKU_OTHER_CATEGORIES[0].value;
}

export function formatHaikuOtherCategory(value = "") {
  return (
    HAIKU_OTHER_CATEGORIES.find((item) => item.value === value)?.label ||
    HAIKU_OTHER_CATEGORIES[0].label
  );
}
