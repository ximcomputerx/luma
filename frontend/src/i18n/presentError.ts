import { readCommandError } from "../ipc/types";
import type { MessageId } from "./en-US";
import { t } from "./translate";

const exact: Record<string, MessageId> = {
  "已取消": "error.dialogCanceled",
  "只能打开 UTF-8 文本。": "file.notUtf8",
  "文件超过 8 MB，无法打开。": "file.tooLarge",
  "文件超过 8 MB，RustMark 拒绝打开。": "file.tooLarge",
  "图片超过 8 MB。": "error.imageTooLarge",
  "路径不在已打开的文件夹内。": "error.outsideJail",
  "无法完成文件操作。": "error.io",
  "找不到文件": "file.missing",
  "无法打开此文件": "file.rejected",
  "无法更改文件关联": "assoc.error",
  "保存冲突，没有写入磁盘。": "error.conflict",
  "不能把密钥写进设置。": "error.invalidSettingsSecret",
  "设置项无效。": "error.invalidSettings",
  "设置文件版本较新，不会改写。": "settings.newer",
  "设置文件版本较新，RustMark 不会改写它。": "settings.newer",
  "无法读取设置。": "error.settingsRead",
  "无法保存设置。": "error.settingsWrite",
  "无法打开打印页面。": "error.pdfOpen",
  "导出设置无效。": "error.pdfSettings",
  "打印页面没有完成加载。": "error.pdfLoad",
  "导出 PDF 超时。": "error.pdfTimeout",
  "导出 PDF 失败。": "error.pdfFailed",
  "这个系统请用导出 HTML。PDF 文件导出目前只在 Windows 上写盘。": "error.pdfUnavailable",
  "先保存文档，再粘贴图片。": "image.needSave",
  "只能粘贴 PNG、JPEG、GIF 或 WebP。": "error.imageType",
  "打开的标签太多。": "error.tooManyTabs",
  "无法关闭窗口。": "error.windowClose",
  "无法检查更新": "error.updateCheck",
  "无法验证更新": "error.updateVerify",
  "无法下载更新": "error.updateDownload",
  "无法安装更新": "error.updateInstall",
};

const byCode: Partial<Record<string, MessageId>> = {
  not_utf8: "file.notUtf8",
  rejected: "file.rejected",
  outside_jail: "error.outsideJail",
  conflict: "error.conflict",
  dialog_canceled: "error.dialogCanceled",
};

export function presentError(error: unknown): string {
  const parsed = readCommandError(error);
  const matched = exact[parsed.message];
  if (matched) {
    return t(matched);
  }
  const coded = byCode[parsed.code];
  if (coded) {
    return t(coded);
  }
  if (parsed.code === "invalid_settings") {
    return t("error.invalidSettings");
  }
  if (parsed.message) {
    return parsed.message;
  }
  return t("error.io");
}
