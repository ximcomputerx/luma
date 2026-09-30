use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

pub fn command_error(code: &str, message: &str) -> CommandError {
    CommandError {
        code: code.to_string(),
        message: message.to_string(),
    }
}

pub fn canceled() -> CommandError {
    command_error("dialog_canceled", "已取消")
}

pub fn not_utf8() -> CommandError {
    command_error("not_utf8", "只能打开 UTF-8 文本。")
}

pub fn too_large() -> CommandError {
    command_error("too_large", "文件超过 8 MB，无法打开。")
}

pub fn outside_jail() -> CommandError {
    command_error("outside_jail", "路径不在已打开的文件夹内。")
}

pub fn io_failed() -> CommandError {
    command_error("io", "无法完成文件操作。")
}

pub fn missing() -> CommandError {
    command_error("io", "找不到文件")
}

pub fn conflict() -> CommandError {
    command_error("conflict", "保存冲突，没有写入磁盘。")
}

pub fn invalid_settings(secret: bool) -> CommandError {
    command_error(
        "invalid_settings",
        if secret {
            "不能把密钥写进设置。"
        } else {
            "设置项无效。"
        },
    )
}
