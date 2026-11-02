//! Verify a previously signature-checked Horizon archive's real launch contracts, without downloading or starting Minecraft.
#[tokio::main]
async fn main() -> ar_core::Result<()> {
    let folder = std::env::args()
        .nth(1)
        .ok_or("Pass the path to the verified Horizon build directory")?;
    println!(
        "{}",
        ar_core::horizon::inspect(std::path::Path::new(&folder)).await?
    );
    Ok(())
}
