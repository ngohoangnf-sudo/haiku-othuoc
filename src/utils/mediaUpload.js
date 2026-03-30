import { API_BASE } from "src/utils/runtime";
import authStore from "src/stores/authStore";

async function parseUploadError(response, fallback) {
  try {
    const data = await response.json();
    return data?.message || fallback;
  } catch (_error) {
    try {
      const text = await response.text();
      return text || fallback;
    } catch (_textError) {
      return fallback;
    }
  }
}

export async function uploadImageToMediaStore(file, options = {}) {
  if (!(file instanceof File)) {
    throw new Error("File upload không hợp lệ.");
  }

  const presignResponse = await fetch(`${API_BASE}/media/presign`, {
    method: "POST",
    headers: authStore.getAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      scope: options.scope || "misc",
    }),
  });

  if (!presignResponse.ok) {
    throw new Error(
      await parseUploadError(presignResponse, "Không lấy được link upload ảnh từ máy chủ.")
    );
  }

  const payload = await presignResponse.json();
  const uploadUrl = String(payload?.uploadUrl || "").trim();
  const publicUrl = String(payload?.publicUrl || "").trim();

  if (!uploadUrl || !publicUrl) {
    throw new Error("Máy chủ không trả về link upload hợp lệ.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: payload?.method || "PUT",
    headers: {
      ...(payload?.headers || {}),
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error(await parseUploadError(uploadResponse, "Không tải được file ảnh lên S3."));
  }

  return {
    url: publicUrl,
    key: payload?.key || "",
    fileName: file.name,
  };
}
