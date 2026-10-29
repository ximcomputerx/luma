//! Owned markdown AST. Parser event types stay inside `adapter`.
#![forbid(unsafe_code)]

mod adapter;
mod ast;
mod html_img;

pub use adapter::parse;
pub use ast::*;

pub use rustmark_core::NewlineStyle;
