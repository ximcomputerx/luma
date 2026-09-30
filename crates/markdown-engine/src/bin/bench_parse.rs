use std::time::Instant;

use markdown_engine::{parse, NewlineStyle};

fn main() {
    for label in ["100 KiB", "1 MiB"] {
        let bytes = if label == "100 KiB" {
            100 * 1024
        } else {
            1024 * 1024
        };
        let markdown = generate(bytes);
        let mut samples = Vec::with_capacity(30);
        for index in 0..30 {
            let started = Instant::now();
            let document = parse(&markdown, NewlineStyle::Lf);
            let elapsed = started.elapsed().as_secs_f64() * 1000.0;
            if index >= 5 {
                samples.push(elapsed);
            }
            std::hint::black_box(document.block_count());
        }
        samples.sort_by(|left, right| left.total_cmp(right));
        let p50 = percentile(&samples, 0.50);
        let p99 = percentile(&samples, 0.99);
        println!(
            "{label} parse p50 {p50:.2} ms  p99 {p99:.2} ms  n {}",
            samples.len()
        );
    }
}

fn generate(target: usize) -> String {
    let mut out = String::with_capacity(target + 64);
    let mut index = 0u32;
    while out.len() < target {
        index += 1;
        out.push_str(&format!(
            "# Heading {index}\n\nParagraph {index} with **bold** and `code`.\n\n"
        ));
    }
    out.truncate(target);
    out
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let index = ((sorted.len() - 1) as f64 * p).round() as usize;
    sorted[index]
}
